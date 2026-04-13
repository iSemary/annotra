"""Load media, run modality-specific inference, persist Annotation rows."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.orm import selectinload

from core.config import Settings
from models.annotation import Annotation as AnnotationRow
from models.annotation_asset import AnnotationAsset
from models.media import Media
from services.ml_inference.mask3d_runner import run_mask3d_mesh
from services.ml_inference.sam2_runner import run_sam2_image, run_sam2_video
from services.ml_inference.whisper_runner import run_whisper_audio

if TYPE_CHECKING:
    from services.media_storage.local import LocalMediaStorage
    from services.media_storage.s3 import S3MediaStorage

log = logging.getLogger("annotra.ml.orchestrator")


async def _read_media_bytes(
    session,
    media_id: UUID,
    storage: "LocalMediaStorage | S3MediaStorage",
) -> bytes:
    row = await session.get(Media, media_id)
    if row is None:
        raise RuntimeError(f"media_not_found:{media_id}")
    return await storage.read_bytes(row.storage_key)


async def run_ml_for_asset(
    session,
    asset: AnnotationAsset,
    storage: "LocalMediaStorage | S3MediaStorage",
    settings: Settings,
) -> None:
    log.info(
        "ml_pipeline_run_start",
        extra={
            "asset_id": str(asset.id),
            "file_type": asset.file_type,
            "dry_run": settings.ML_PIPELINE_DRY_RUN,
        },
    )

    await session.refresh(asset, ["dataset_members"])

    rows: list[tuple[str, dict]] = []

    if asset.file_type == "image":
        if not asset.primary_media_id:
            raise RuntimeError("missing_primary_media")
        data = await _read_media_bytes(session, asset.primary_media_id, storage)
        for payload in run_sam2_image(data, settings):
            rows.append(("image_bbox", payload))

    elif asset.file_type == "video":
        if not asset.primary_media_id:
            raise RuntimeError("missing_primary_media")
        data = await _read_media_bytes(session, asset.primary_media_id, storage)
        items, frame_count = run_sam2_video(data, settings)
        asset.frame_count = frame_count
        for it in items:
            rows.append((it["annotation_kind"], it["payload"]))

    elif asset.file_type == "audio":
        if not asset.primary_media_id:
            raise RuntimeError("missing_primary_media")
        data = await _read_media_bytes(session, asset.primary_media_id, storage)
        payloads, duration = run_whisper_audio(data, settings)
        if duration is not None:
            asset.duration_seconds = duration
        for payload in payloads:
            rows.append(("audio_segment", payload))

    elif asset.file_type == "model_3d":
        if not asset.primary_media_id:
            raise RuntimeError("missing_primary_media")
        data = await _read_media_bytes(session, asset.primary_media_id, storage)
        for payload in run_mask3d_mesh(data, settings):
            rows.append(("model_3d_oriented_box", payload))

    elif asset.file_type == "dataset":
        members = list(asset.dataset_members or [])
        members.sort(key=lambda m: m.sort_order)
        for m in members:
            data = await _read_media_bytes(session, m.media_id, storage)
            for payload in run_sam2_image(data, settings):
                payload = dict(payload)
                payload["member_media_id"] = str(m.media_id)
                rows.append(("image_bbox", payload))
    else:
        raise RuntimeError(f"unsupported_file_type:{asset.file_type}")

    for kind, payload in rows:
        session.add(
            AnnotationRow(
                asset_id=asset.id,
                annotation_kind=kind,
                payload=payload,
            ),
        )

    asset.status = "completed"
    asset.updated_at = datetime.now(UTC)
    log.info(
        "ml_pipeline_run_done",
        extra={"asset_id": str(asset.id), "annotations_written": len(rows)},
    )


async def load_asset_for_pipeline(session, asset_id: UUID) -> AnnotationAsset | None:
    from sqlalchemy import select

    stmt = (
        select(AnnotationAsset)
        .where(AnnotationAsset.id == asset_id)
        .options(selectinload(AnnotationAsset.dataset_members))
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()
