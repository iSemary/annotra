from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.rbac import RequestContext
from models.annotation import Annotation as AnnotationRow
from models.annotation_asset import AnnotationAsset
from models.project import Project


class DashboardService:
    @staticmethod
    def summary(ctx: RequestContext) -> dict:
        return {
            "company_id": str(ctx.company_id),
            "slug": ctx.company_slug,
            "user_id": str(ctx.user_id),
            "role": ctx.role_name,
        }

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def workspace_stats(self, ctx: RequestContext) -> dict:
        cid = ctx.company_id
        project_scope = (
            Project.company_id == cid,
            Project.deleted_at.is_(None),
        )

        projects_total = int(
            (
                await self._session.execute(
                    select(func.count()).select_from(Project).where(*project_scope),
                )
            ).scalar_one()
            or 0,
        )

        active_projects = int(
            (
                await self._session.execute(
                    select(func.count())
                    .select_from(Project)
                    .where(*project_scope, Project.status == "active"),
                )
            ).scalar_one()
            or 0,
        )

        assets_total = int(
            (
                await self._session.execute(
                    select(func.count(AnnotationAsset.id))
                    .select_from(AnnotationAsset)
                    .join(Project, AnnotationAsset.project_id == Project.id)
                    .where(*project_scope),
                )
            ).scalar_one()
            or 0,
        )

        asset_type_rows = (
            await self._session.execute(
                select(AnnotationAsset.file_type, func.count(AnnotationAsset.id))
                .join(Project, AnnotationAsset.project_id == Project.id)
                .where(*project_scope)
                .group_by(AnnotationAsset.file_type),
            )
        ).all()

        assets_by_type: dict[str, int] = {
            "image": 0,
            "video": 0,
            "audio": 0,
            "dataset": 0,
            "model_3d": 0,
        }
        for ft, cnt in asset_type_rows:
            if ft in assets_by_type:
                assets_by_type[ft] = int(cnt)

        annotations_total = int(
            (
                await self._session.execute(
                    select(func.count(AnnotationRow.id))
                    .select_from(AnnotationRow)
                    .join(AnnotationAsset, AnnotationRow.asset_id == AnnotationAsset.id)
                    .join(Project, AnnotationAsset.project_id == Project.id)
                    .where(*project_scope),
                )
            ).scalar_one()
            or 0,
        )

        ann_by_type_rows = (
            await self._session.execute(
                select(AnnotationAsset.file_type, func.count(AnnotationRow.id))
                .select_from(AnnotationRow)
                .join(AnnotationAsset, AnnotationRow.asset_id == AnnotationAsset.id)
                .join(Project, AnnotationAsset.project_id == Project.id)
                .where(*project_scope)
                .group_by(AnnotationAsset.file_type),
            )
        ).all()

        annotations_by_asset_type: dict[str, int] = {
            "image": 0,
            "video": 0,
            "audio": 0,
            "dataset": 0,
            "model_3d": 0,
        }
        for ft, cnt in ann_by_type_rows:
            if ft in annotations_by_asset_type:
                annotations_by_asset_type[ft] = int(cnt)

        return {
            "projects_total": projects_total,
            "projects_active": active_projects,
            "annotation_assets_total": assets_total,
            "annotations_total": annotations_total,
            "assets_by_type": assets_by_type,
            "annotations_by_asset_type": annotations_by_asset_type,
        }
