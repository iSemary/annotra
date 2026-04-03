from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.annotation_permissions import FILE_TYPES, allowed_file_types_for_reads
from core.exceptions import AppException
from core.rbac import RequestContext
from models.annotation import Annotation as AnnotationRow
from models.annotation_asset import AnnotationAsset
from models.project import Project
from schemas.project import ProjectCreateRequest, ProjectUpdateRequest
from services.audit_service import AuditService


def project_to_dict(p: Project) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "status": p.status,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


def _empty_project_stats() -> dict[str, Any]:
    return {
        "files_by_type": {ft: 0 for ft in sorted(FILE_TYPES)},
        "files_total": 0,
        "annotations_total": 0,
    }


async def annotation_stats_for_projects(
    session: AsyncSession,
    ctx: RequestContext,
    project_ids: list[UUID],
) -> dict[str, dict[str, Any]]:
    """Per-project counts for assets (by file_type) and annotation rows; respects read modalities."""
    if not project_ids:
        return {}
    allowed = allowed_file_types_for_reads(ctx)
    out: dict[str, dict[str, Any]] = {
        str(pid): _empty_project_stats() for pid in project_ids
    }
    if not allowed:
        return out

    r = await session.execute(
        select(
            AnnotationAsset.project_id,
            AnnotationAsset.file_type,
            func.count(AnnotationAsset.id),
        )
        .join(Project, AnnotationAsset.project_id == Project.id)
        .where(
            Project.company_id == ctx.company_id,
            Project.deleted_at.is_(None),
            AnnotationAsset.project_id.in_(project_ids),
            AnnotationAsset.file_type.in_(allowed),
        )
        .group_by(AnnotationAsset.project_id, AnnotationAsset.file_type),
    )
    for row in r.all():
        pid_s, ft, c = str(row[0]), row[1], int(row[2])
        if pid_s not in out:
            continue
        out[pid_s]["files_by_type"][ft] = c
        out[pid_s]["files_total"] += c

    r2 = await session.execute(
        select(
            AnnotationAsset.project_id,
            func.count(AnnotationRow.id),
        )
        .select_from(AnnotationRow)
        .join(AnnotationAsset, AnnotationRow.asset_id == AnnotationAsset.id)
        .join(Project, AnnotationAsset.project_id == Project.id)
        .where(
            Project.company_id == ctx.company_id,
            Project.deleted_at.is_(None),
            AnnotationAsset.project_id.in_(project_ids),
            AnnotationAsset.file_type.in_(allowed),
        )
        .group_by(AnnotationAsset.project_id),
    )
    for row in r2.all():
        pid_s, c = str(row[0]), int(row[1])
        if pid_s in out:
            out[pid_s]["annotations_total"] = c

    return out


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditService(session)

    async def get_by_id(self, ctx: RequestContext, project_id: UUID) -> Project:
        result = await self._session.execute(
            select(Project).where(
                Project.id == project_id,
                Project.company_id == ctx.company_id,
                Project.deleted_at.is_(None),
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise AppException(404, "Project not found")
        return row

    async def list_projects(
        self,
        ctx: RequestContext,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], dict[str, int]]:
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        filters = [
            Project.company_id == ctx.company_id,
            Project.deleted_at.is_(None),
        ]
        if status and status.strip():
            filters.append(Project.status == status.strip())
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(
                or_(Project.name.ilike(term), Project.description.ilike(term)),
            )
        count_stmt = select(func.count()).select_from(Project).where(*filters)
        total = int((await self._session.execute(count_stmt)).scalar_one())
        offset = (page - 1) * page_size
        result = await self._session.execute(
            select(Project)
            .where(*filters)
            .order_by(Project.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        rows = result.scalars().all()
        items = [project_to_dict(p) for p in rows]
        if items:
            ids = [UUID(p["id"]) for p in items]
            stats_map = await annotation_stats_for_projects(self._session, ctx, ids)
            for p in items:
                p["stats"] = stats_map.get(p["id"], _empty_project_stats())
        total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
        meta = {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        }
        return items, meta

    async def create(self, ctx: RequestContext, body: ProjectCreateRequest) -> Project:
        p = Project(
            company_id=ctx.company_id,
            name=body.name.strip(),
            description=body.description.strip() if body.description else None,
            status=body.status,
        )
        self._session.add(p)
        await self._session.flush()
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="project.create",
            resource_type="project",
            resource_id=str(p.id),
        )
        return p

    async def update(
        self,
        ctx: RequestContext,
        project_id: UUID,
        body: ProjectUpdateRequest,
    ) -> Project:
        p = await self.get_by_id(ctx, project_id)
        p.name = body.name.strip()
        p.description = body.description.strip() if body.description else None
        p.status = body.status
        p.updated_at = datetime.now(UTC)
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="project.update",
            resource_type="project",
            resource_id=str(p.id),
        )
        return p

    async def soft_delete(self, ctx: RequestContext, project_id: UUID) -> None:
        p = await self.get_by_id(ctx, project_id)
        p.deleted_at = datetime.now(UTC)
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="project.delete",
            resource_type="project",
            resource_id=str(p.id),
        )
