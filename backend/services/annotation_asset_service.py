from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import case, cast, delete, exists, func, or_, select
from sqlalchemy.types import Text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.annotation_permissions import (
    FILE_TYPES,
    ensure_can_read_file_type,
    ensure_can_write_file_type,
    ensure_projects_read,
    allowed_file_types_for_reads,
)
from core.exceptions import AppException
from core.rbac import RequestContext
from models.annotation import Annotation as AnnotationRow
from models.annotation_asset import AnnotationAsset
from models.annotation_asset_media import AnnotationAssetMedia
from models.media import Media
from models.media_kind import MediaKind
from models.project import Project
from schemas.annotation import (
    AnnotationAssetCreateRequest,
    AnnotationAssetPatchRequest,
    AnnotationCreateRequest,
    AnnotationPatchRequest,
)
from services.media_service import MediaService, get_media_storage
from services.project_service import ProjectService
from utils.pagination import pagination_meta


_DEFAULT_TITLE_LABEL = {
    "image": "Image",
    "video": "Video",
    "audio": "Audio",
    "dataset": "Dataset",
    "model_3d": "3D model",
}


def _status_rank():
    return case(
        (AnnotationAsset.status == "draft", 0),
        (AnnotationAsset.status == "in_progress", 1),
        (AnnotationAsset.status == "failed", 2),
        (AnnotationAsset.status == "completed", 3),
        (AnnotationAsset.status == "reviewed", 4),
        else_=0,
    )


def _validate_annotation_kind_for_asset(file_type: str, kind: str) -> None:
    if file_type in ("image", "dataset"):
        if kind != "image_bbox":
            raise AppException(400, "Only image_bbox annotations allowed for this asset type")
    elif file_type == "video":
        if kind not in ("video_frame_bbox", "video_track"):
            raise AppException(400, "Invalid annotation kind for video asset")
    elif file_type == "audio":
        if kind != "audio_segment":
            raise AppException(400, "Only audio_segment annotations allowed for audio assets")
    elif file_type == "model_3d":
        if kind not in ("model_3d_point", "model_3d_oriented_box"):
            raise AppException(400, "Invalid annotation kind for 3D model asset")


class AnnotationAssetService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._projects = ProjectService(session)
        self._media = MediaService(session)

    async def _get_project(self, ctx: RequestContext, project_id: UUID) -> Project:
        return await self._projects.get_by_id(ctx, project_id)

    async def _next_default_asset_title(self, project_id: UUID, file_type: str) -> str:
        r = await self._session.execute(
            select(func.count())
            .select_from(AnnotationAsset)
            .where(
                AnnotationAsset.project_id == project_id,
                AnnotationAsset.file_type == file_type,
            ),
        )
        n = int(r.scalar_one()) + 1
        label = _DEFAULT_TITLE_LABEL.get(file_type, file_type.capitalize())
        return f"{label} #{n}"

    async def _load_asset(
        self,
        ctx: RequestContext,
        asset_id: UUID,
        *,
        with_members: bool = False,
    ) -> AnnotationAsset:
        opts = []
        if with_members:
            opts.append(selectinload(AnnotationAsset.dataset_members))
        result = await self._session.execute(
            select(AnnotationAsset)
            .where(AnnotationAsset.id == asset_id)
            .options(*opts),
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise AppException(404, "Annotation asset not found")
        await self._get_project(ctx, row.project_id)
        ensure_can_read_file_type(ctx, row.file_type)
        return row

    async def list_assets(
        self,
        ctx: RequestContext,
        *,
        project_id: UUID | None,
        page: int,
        per_page: int,
        search: str | None,
        status: str | None,
        file_type: str | None,
        sort_by: str,
        sort_dir: str,
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        ensure_projects_read(ctx)
        if project_id is not None:
            await self._get_project(ctx, project_id)
        allowed = allowed_file_types_for_reads(ctx)
        if not allowed:
            return [], pagination_meta(page=page, page_size=per_page, total=0)

        page = max(1, page)
        per_page = min(max(1, per_page), 100)

        filters: list[Any] = [
            Project.company_id == ctx.company_id,
            Project.deleted_at.is_(None),
        ]
        if project_id is not None:
            filters.append(AnnotationAsset.project_id == project_id)

        type_filter = list(allowed)
        if file_type and file_type.strip():
            ft = file_type.strip()
            if ft not in FILE_TYPES:
                raise AppException(400, "Invalid file_type filter")
            if ft not in allowed:
                return [], pagination_meta(page=page, page_size=per_page, total=0)
            type_filter = [ft]
        filters.append(AnnotationAsset.file_type.in_(type_filter))

        if status and status.strip():
            filters.append(AnnotationAsset.status == status.strip())
        if search and search.strip():
            term = f"%{search.strip()}%"
            ann_text_match = exists(
                select(1)
                .select_from(AnnotationRow)
                .where(
                    AnnotationRow.asset_id == AnnotationAsset.id,
                    cast(AnnotationRow.payload, Text).ilike(term),
                ),
            )
            filters.append(
                or_(AnnotationAsset.title.ilike(term), ann_text_match),
            )

        # Grouped counts (correlated scalar subqueries can return the global total on some DBs).
        ann_per_asset = (
            select(
                AnnotationRow.asset_id.label("asset_id"),
                func.count(AnnotationRow.id).label("ac"),
            )
            .group_by(AnnotationRow.asset_id)
            .subquery()
        )
        annotations_count_col = func.coalesce(ann_per_asset.c.ac, 0)
        base = (
            select(
                AnnotationAsset,
                annotations_count_col.label("annotations_count"),
                Project.name,
            )
            .join(Project, AnnotationAsset.project_id == Project.id)
            .outerjoin(
                ann_per_asset,
                ann_per_asset.c.asset_id == AnnotationAsset.id,
            )
            .where(*filters)
        )

        order_col: Any
        if sort_by == "annotations_count":
            order_col = annotations_count_col
        elif sort_by == "progress":
            order_col = _status_rank()
        else:
            order_col = AnnotationAsset.updated_at

        if sort_dir == "asc":
            base = base.order_by(order_col.asc(), AnnotationAsset.id.asc())
        else:
            base = base.order_by(order_col.desc(), AnnotationAsset.id.desc())

        count_stmt = (
            select(func.count(AnnotationAsset.id))
            .select_from(AnnotationAsset)
            .join(Project, AnnotationAsset.project_id == Project.id)
            .where(*filters)
        )
        total = int((await self._session.execute(count_stmt)).scalar_one())
        offset = (page - 1) * per_page
        result = await self._session.execute(base.offset(offset).limit(per_page))
        rows = result.all()

        out: list[dict[str, Any]] = []
        for asset, acount, project_name in rows:
            out.append(
                await self._asset_to_dict(
                    asset,
                    int(acount or 0),
                    project_name=project_name,
                ),
            )
        return out, pagination_meta(page=page, page_size=per_page, total=total)

    async def _asset_to_dict(
        self,
        asset: AnnotationAsset,
        annotations_count: int,
        *,
        with_members: bool = False,
        project_name: str | None = None,
    ) -> dict[str, Any]:
        # Avoid lazy-loading dataset_members in async code (MissingGreenlet).
        needs_members = with_members or asset.file_type == "dataset"
        if needs_members:
            await self._session.refresh(asset, ["dataset_members"])
            dataset_n = len(asset.dataset_members) if asset.dataset_members else 0
            dataset_media_ids = [str(m.media_id) for m in (asset.dataset_members or [])]
        else:
            dataset_n = 0
            dataset_media_ids = []

        if asset.file_type == "image":
            dataset_size_value: int | float | None = 1
            dataset_size_unit = "images"
        elif asset.file_type == "video":
            dataset_size_value = asset.frame_count
            dataset_size_unit = "frames"
        elif asset.file_type == "audio":
            dataset_size_value = asset.duration_seconds
            dataset_size_unit = "seconds"
        elif asset.file_type == "model_3d":
            dataset_size_value = 1
            dataset_size_unit = "models"
        else:
            dataset_size_value = dataset_n
            dataset_size_unit = "images"

        primary_url: str | None = None
        file_size_bytes: int | None = None
        if asset.primary_media_id:
            pm = await self._session.get(Media, asset.primary_media_id)
            if pm:
                storage = get_media_storage()
                primary_url = await storage.get_url(pm.storage_key)
                file_size_bytes = pm.size_bytes

        if (
            asset.file_type == "dataset"
            and needs_members
            and asset.dataset_members
        ):
            mids = [m.media_id for m in asset.dataset_members]
            if mids:
                total = await self._session.scalar(
                    select(
                        func.coalesce(
                            func.sum(func.coalesce(Media.size_bytes, 0)),
                            0,
                        ),
                    ).where(Media.id.in_(mids)),
                )
                file_size_bytes = int(total or 0)

        out: dict[str, Any] = {
            "id": str(asset.id),
            "project_id": str(asset.project_id),
            "file_type": asset.file_type,
            "title": asset.title,
            "status": asset.status,
            "primary_media_id": str(asset.primary_media_id)
            if asset.primary_media_id
            else None,
            "primary_media_url": primary_url,
            "frame_count": asset.frame_count,
            "duration_seconds": asset.duration_seconds,
            "annotations_count": annotations_count,
            "dataset_size": {"value": dataset_size_value, "unit": dataset_size_unit},
            "file_size_bytes": file_size_bytes,
            "dataset_media_ids": dataset_media_ids,
            "created_at": asset.created_at.isoformat(),
            "updated_at": asset.updated_at.isoformat(),
        }
        if project_name is not None:
            out["project_name"] = project_name
        return out

    async def create_asset(
        self,
        ctx: RequestContext,
        body: AnnotationAssetCreateRequest,
    ) -> AnnotationAsset:
        ensure_projects_read(ctx)
        ensure_can_write_file_type(ctx, body.file_type)
        await self._get_project(ctx, body.project_id)

        title = body.title or await self._next_default_asset_title(
            body.project_id,
            body.file_type,
        )
        # New assets enter the processing pipeline immediately (client status is ignored).
        asset = AnnotationAsset(
            project_id=body.project_id,
            file_type=body.file_type,
            title=title,
            status="in_progress",
            frame_count=body.frame_count,
            duration_seconds=body.duration_seconds,
        )

        if body.file_type == "dataset":
            if not body.dataset_media_ids or len(body.dataset_media_ids) < 2:
                raise AppException(400, "dataset requires at least two media ids")
            if body.primary_media_id is not None:
                raise AppException(400, "dataset assets must not set primary_media_id")
            seen: set[UUID] = set()
            for mid in body.dataset_media_ids:
                if mid in seen:
                    raise AppException(400, "duplicate media id in dataset")
                seen.add(mid)
                m = await self._media.find_by_id(mid, ctx.user_id)
                if m.kind != MediaKind.IMAGE.value:
                    raise AppException(400, "dataset members must be image media")
            self._session.add(asset)
            await self._session.flush()
            for i, mid in enumerate(body.dataset_media_ids):
                self._session.add(
                    AnnotationAssetMedia(
                        asset_id=asset.id,
                        media_id=mid,
                        sort_order=i,
                    ),
                )
            await self._session.flush()
        else:
            if body.primary_media_id is None:
                raise AppException(400, "primary_media_id is required for this file type")
            if body.dataset_media_ids:
                raise AppException(400, "dataset_media_ids only allowed for dataset assets")
            m = await self._media.find_by_id(body.primary_media_id, ctx.user_id)
            expected_by_type = {
                "image": MediaKind.IMAGE.value,
                "video": MediaKind.VIDEO.value,
                "audio": MediaKind.AUDIO.value,
                "model_3d": MediaKind.MODEL_3D.value,
            }
            expected = expected_by_type[body.file_type]
            if m.kind != expected:
                raise AppException(400, f"Media kind {m.kind} does not match file_type {body.file_type}")
            asset.primary_media_id = body.primary_media_id
            self._session.add(asset)

        await self._session.flush()
        await self._session.refresh(asset)
        if body.file_type == "dataset":
            await self._session.refresh(asset, ["dataset_members"])
        return asset

    async def get_asset(self, ctx: RequestContext, asset_id: UUID) -> dict[str, Any]:
        asset = await self._load_asset(ctx, asset_id, with_members=True)
        cnt = await self._annotation_count(asset_id)
        return await self._asset_to_dict(asset, cnt, with_members=True)

    async def _annotation_count(self, asset_id: UUID) -> int:
        r = await self._session.execute(
            select(func.count()).select_from(AnnotationRow).where(AnnotationRow.asset_id == asset_id),
        )
        return int(r.scalar_one())

    async def _sync_asset_status_for_annotation_count(self, asset_id: UUID) -> None:
        """At least one annotation → completed (unless reviewed). None left after completed → in_progress."""
        asset = await self._session.get(AnnotationAsset, asset_id)
        if asset is None:
            return
        cnt = await self._annotation_count(asset_id)
        if cnt >= 1:
            if asset.status != "reviewed":
                asset.status = "completed"
        elif asset.status == "completed":
            asset.status = "in_progress"
        asset.updated_at = datetime.now(UTC)
        await self._session.flush()

    async def patch_asset(
        self,
        ctx: RequestContext,
        asset_id: UUID,
        body: AnnotationAssetPatchRequest,
    ) -> dict[str, Any]:
        asset = await self._load_asset(ctx, asset_id, with_members=True)
        ensure_can_write_file_type(ctx, asset.file_type)
        if body.title is not None:
            asset.title = body.title.strip()
        if body.status is not None:
            asset.status = body.status
        if body.frame_count is not None:
            asset.frame_count = body.frame_count
        if body.duration_seconds is not None:
            asset.duration_seconds = body.duration_seconds
        asset.updated_at = datetime.now(UTC)
        await self._session.flush()
        cnt = await self._annotation_count(asset_id)
        return await self._asset_to_dict(asset, cnt, with_members=True)

    async def delete_asset(self, ctx: RequestContext, asset_id: UUID) -> None:
        asset = await self._load_asset(ctx, asset_id)
        ensure_can_write_file_type(ctx, asset.file_type)
        await self._session.delete(asset)
        await self._session.flush()

    async def list_annotations(
        self,
        ctx: RequestContext,
        asset_id: UUID,
    ) -> list[dict[str, Any]]:
        await self._load_asset(ctx, asset_id)
        result = await self._session.execute(
            select(AnnotationRow)
            .where(AnnotationRow.asset_id == asset_id)
            .order_by(AnnotationRow.created_at.asc()),
        )
        rows = result.scalars().all()
        return [
            {
                "id": str(a.id),
                "annotation_kind": a.annotation_kind,
                "payload": a.payload,
                "created_at": a.created_at.isoformat(),
                "updated_at": a.updated_at.isoformat(),
            }
            for a in rows
        ]

    async def create_annotation(
        self,
        ctx: RequestContext,
        asset_id: UUID,
        body: AnnotationCreateRequest,
    ) -> dict[str, Any]:
        asset = await self._load_asset(ctx, asset_id, with_members=True)
        ensure_can_write_file_type(ctx, asset.file_type)
        _validate_annotation_kind_for_asset(asset.file_type, body.annotation_kind)
        try:
            payload = body.parsed_payload()
        except Exception as e:
            raise AppException(400, f"Invalid payload: {e}") from e
        if asset.file_type == "dataset" and body.annotation_kind == "image_bbox":
            mid = payload.get("member_media_id")
            if not mid:
                raise AppException(400, "member_media_id is required for dataset annotations")
            try:
                mid_uuid = UUID(str(mid))
            except ValueError as err:
                raise AppException(400, "Invalid member_media_id") from err
            member_ids = {m.media_id for m in (asset.dataset_members or [])}
            if mid_uuid not in member_ids:
                raise AppException(400, "member_media_id must be part of the dataset")

        row = AnnotationRow(
            asset_id=asset_id,
            annotation_kind=body.annotation_kind,
            payload=payload,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        await self._sync_asset_status_for_annotation_count(asset_id)
        return {
            "id": str(row.id),
            "annotation_kind": row.annotation_kind,
            "payload": row.payload,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }

    async def patch_annotation(
        self,
        ctx: RequestContext,
        asset_id: UUID,
        annotation_id: UUID,
        body: AnnotationPatchRequest,
    ) -> dict[str, Any]:
        asset = await self._load_asset(ctx, asset_id, with_members=True)
        ensure_can_write_file_type(ctx, asset.file_type)
        result = await self._session.execute(
            select(AnnotationRow).where(
                AnnotationRow.id == annotation_id,
                AnnotationRow.asset_id == asset_id,
            ),
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise AppException(404, "Annotation not found")
        kind = body.annotation_kind or row.annotation_kind
        _validate_annotation_kind_for_asset(asset.file_type, kind)
        try:
            new_kind, new_payload = body.merge_kind_and_payload(
                row.annotation_kind,
                row.payload,
            )
        except Exception as e:
            raise AppException(400, f"Invalid payload: {e}") from e
        if asset.file_type == "dataset" and new_kind == "image_bbox":
            mid = new_payload.get("member_media_id")
            if not mid:
                raise AppException(400, "member_media_id is required for dataset annotations")
            try:
                mid_uuid = UUID(str(mid))
            except ValueError as err:
                raise AppException(400, "Invalid member_media_id") from err
            member_ids = {m.media_id for m in (asset.dataset_members or [])}
            if mid_uuid not in member_ids:
                raise AppException(400, "member_media_id must be part of the dataset")

        row.annotation_kind = new_kind
        row.payload = new_payload
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return {
            "id": str(row.id),
            "annotation_kind": row.annotation_kind,
            "payload": row.payload,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }

    async def delete_annotation(
        self,
        ctx: RequestContext,
        asset_id: UUID,
        annotation_id: UUID,
    ) -> None:
        await self._load_asset(ctx, asset_id)
        asset = await self._session.get(AnnotationAsset, asset_id)
        if asset:
            ensure_can_write_file_type(ctx, asset.file_type)
        result = await self._session.execute(
            select(AnnotationRow).where(
                AnnotationRow.id == annotation_id,
                AnnotationRow.asset_id == asset_id,
            ),
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise AppException(404, "Annotation not found")
        await self._session.delete(row)
        await self._session.flush()
        await self._sync_asset_status_for_annotation_count(asset_id)

    async def re_annotate_with_model(self, ctx: RequestContext, asset_id: UUID) -> dict[str, Any]:
        """Delete all annotations and reset asset to in_progress; caller commits and schedules pipeline."""
        import logging

        log_ml = logging.getLogger("annotra.annotation_asset")
        asset = await self._load_asset(ctx, asset_id, with_members=True)
        ensure_can_write_file_type(ctx, asset.file_type)
        n_deleted = await self._annotation_count(asset_id)
        if n_deleted:
            await self._session.execute(
                delete(AnnotationRow).where(AnnotationRow.asset_id == asset_id),
            )
        log_ml.info(
            "re_annotate_start",
            extra={
                "asset_id": str(asset_id),
                "action": "re_annotate",
                "annotations_deleted": n_deleted,
            },
        )
        asset.status = "in_progress"
        asset.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(asset, ["dataset_members"])
        cnt = await self._annotation_count(asset_id)
        return await self._asset_to_dict(asset, cnt, with_members=True)

    async def export_asset(
        self,
        ctx: RequestContext,
        asset_id: UUID,
        fmt: str,
    ) -> tuple[str, str, bytes]:
        asset = await self._load_asset(ctx, asset_id, with_members=True)
        meta = await self.get_asset(ctx, asset_id)
        ann = await self.list_annotations(ctx, asset_id)
        fmt = fmt.lower().strip()
        if fmt == "json":
            body = json.dumps(
                {"asset": meta, "annotations": ann},
                indent=2,
            ).encode("utf-8")
            return "application/json", f"asset-{asset_id}.json", body
        if fmt == "csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["annotation_id", "kind", "payload_json"])
            for a in ann:
                w.writerow([a["id"], a["annotation_kind"], json.dumps(a["payload"])])
            raw = buf.getvalue().encode("utf-8")
            return "text/csv", f"asset-{asset_id}.csv", raw
        if fmt == "coco":
            if asset.file_type not in (
                "image",
                "dataset",
                "audio",
                "video",
                "model_3d",
            ):
                raise AppException(
                    400,
                    "COCO export is not supported for this asset type",
                )
            coco = self._build_coco(meta, ann)
            body = json.dumps(coco, indent=2).encode("utf-8")
            return "application/json", f"asset-{asset_id}-coco.json", body
        raise AppException(400, "format must be json, csv, or coco")

    def _build_coco(self, meta: dict[str, Any], annotations: list[dict[str, Any]]) -> dict[str, Any]:
        images: list[dict[str, Any]] = []
        anns_out: list[dict[str, Any]] = []
        categories: dict[str, int] = {}
        cat_list: list[dict[str, Any]] = []
        image_id_by_key: dict[str, int] = {}
        counters = {"img": 1, "ann": 1}

        def ensure_cat(name: str) -> int:
            if name not in categories:
                cid = len(cat_list) + 1
                categories[name] = cid
                cat_list.append({"id": cid, "name": name})
            return categories[name]

        def ensure_image(file_key: str, width: int = 0, height: int = 0) -> int:
            if file_key not in image_id_by_key:
                iid = counters["img"]
                counters["img"] += 1
                image_id_by_key[file_key] = iid
                images.append(
                    {
                        "id": iid,
                        "file_name": file_key,
                        "width": width,
                        "height": height,
                    },
                )
            return image_id_by_key[file_key]

        ft = meta["file_type"]

        if ft == "image":
            fname = meta.get("title") or meta.get("id", "image")
            iid = ensure_image(str(fname))
            for a in annotations:
                if a["annotation_kind"] != "image_bbox":
                    continue
                p = a["payload"]
                bbox = p.get("bbox") or {}
                x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
                cid = ensure_cat(str(p.get("label", "object")))
                aid = counters["ann"]
                counters["ann"] += 1
                anns_out.append(
                    {
                        "id": aid,
                        "image_id": iid,
                        "category_id": cid,
                        "bbox": [x, y, w, h],
                        "area": float(w) * float(h),
                        "iscrowd": 0,
                    },
                )
        elif ft == "dataset":
            for a in annotations:
                if a["annotation_kind"] != "image_bbox":
                    continue
                p = a["payload"]
                mid = p.get("member_media_id") or "unknown"
                iid = ensure_image(str(mid))
                bbox = p.get("bbox") or {}
                x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
                cid = ensure_cat(str(p.get("label", "object")))
                aid = counters["ann"]
                counters["ann"] += 1
                anns_out.append(
                    {
                        "id": aid,
                        "image_id": iid,
                        "category_id": cid,
                        "bbox": [x, y, w, h],
                        "area": float(w) * float(h),
                        "iscrowd": 0,
                    },
                )
        elif ft == "audio":
            # COCO-style JSON: one synthetic "image" row; bbox encodes [start_s, 0, duration_s, 1].
            base = meta.get("title") or meta.get("id", "audio")
            iid = ensure_image(str(base))
            for a in annotations:
                if a["annotation_kind"] != "audio_segment":
                    continue
                p = a["payload"]
                start = float(p.get("start", 0))
                end = float(p.get("end", start))
                dur = max(end - start, 1e-9)
                cid = ensure_cat(str(p.get("label", "segment")))
                aid = counters["ann"]
                counters["ann"] += 1
                anns_out.append(
                    {
                        "id": aid,
                        "image_id": iid,
                        "category_id": cid,
                        "bbox": [start, 0.0, dur, 1.0],
                        "area": float(dur),
                        "iscrowd": 0,
                    },
                )
        elif ft == "video":
            title = str(meta.get("title") or meta.get("id", "video"))
            for a in annotations:
                if a["annotation_kind"] == "video_frame_bbox":
                    p = a["payload"]
                    frame = int(p.get("frame", 0))
                    iid = ensure_image(f"{title}_frame_{frame}")
                    bbox = p.get("bbox") or {}
                    x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
                    cid = ensure_cat(str(p.get("label", "object")))
                    aid = counters["ann"]
                    counters["ann"] += 1
                    anns_out.append(
                        {
                            "id": aid,
                            "image_id": iid,
                            "category_id": cid,
                            "bbox": [x, y, w, h],
                            "area": float(w) * float(h),
                            "iscrowd": 0,
                        },
                    )
                elif a["annotation_kind"] == "video_track":
                    p = a["payload"]
                    label = str(p.get("label", "object"))
                    w_box = float(p.get("w") or 1)
                    h_box = float(p.get("h") or 1)
                    for pt in p.get("frames") or []:
                        frame = int(pt.get("frame", 0))
                        iid = ensure_image(f"{title}_frame_{frame}")
                        x = float(pt.get("x", 0))
                        y = float(pt.get("y", 0))
                        cid = ensure_cat(label)
                        aid = counters["ann"]
                        counters["ann"] += 1
                        anns_out.append(
                            {
                                "id": aid,
                                "image_id": iid,
                                "category_id": cid,
                                "bbox": [x, y, w_box, h_box],
                                "area": float(w_box * h_box),
                                "iscrowd": 0,
                            },
                        )

        elif ft == "model_3d":
            # Lossy COCO projection: one synthetic "image"; points as 1×1 boxes in XY;
            # oriented boxes as axis-aligned XY bounds (full pose → JSON export).
            base = str(meta.get("title") or meta.get("id", "model_3d"))
            iid = ensure_image(base)
            for a in annotations:
                kind = a["annotation_kind"]
                p = a["payload"]
                if kind == "model_3d_point":
                    pos = p.get("position") or {}
                    x = float(pos.get("x", 0))
                    y = float(pos.get("y", 0))
                    z = float(pos.get("z", 0))
                    cid = ensure_cat(str(p.get("label", "point")))
                    aid = counters["ann"]
                    counters["ann"] += 1
                    anns_out.append(
                        {
                            "id": aid,
                            "image_id": iid,
                            "category_id": cid,
                            "bbox": [x, y, 1.0, 1.0],
                            "area": 1.0,
                            "iscrowd": 0,
                            "annotra_3d": {"z": z},
                        },
                    )
                elif kind == "model_3d_oriented_box":
                    ctr = p.get("center") or {}
                    he = p.get("half_extents") or {}
                    cx = float(ctr.get("x", 0))
                    cy = float(ctr.get("y", 0))
                    cz = float(ctr.get("z", 0))
                    hx = max(float(he.get("x", 0)), 1e-9)
                    hy = max(float(he.get("y", 0)), 1e-9)
                    hz = max(float(he.get("z", 0)), 1e-9)
                    cid = ensure_cat(str(p.get("label", "box")))
                    aid = counters["ann"]
                    counters["ann"] += 1
                    w_box = 2.0 * hx
                    h_box = 2.0 * hy
                    anns_out.append(
                        {
                            "id": aid,
                            "image_id": iid,
                            "category_id": cid,
                            "bbox": [cx - hx, cy - hy, w_box, h_box],
                            "area": float(w_box * h_box),
                            "iscrowd": 0,
                            "annotra_3d": {
                                "center_z": cz,
                                "half_extent_z": hz,
                                "rotation": p.get("rotation"),
                            },
                        },
                    )

        desc = "Annotra export"
        if ft == "audio":
            desc += " (audio: bbox = [start_s, 0, duration_s, 1])"
        elif ft == "model_3d":
            desc += (
                " (3D: COCO bbox is XY-only; z and quaternion use annotra_3d / JSON export)"
            )

        return {
            "info": {"description": desc, "version": "1.0"},
            "images": images,
            "annotations": anns_out,
            "categories": cat_list,
        }
