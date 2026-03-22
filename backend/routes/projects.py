from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.rbac import RequestContext, require_permission
from db.session import get_async_session
from schemas.project import ProjectCreateRequest, ProjectUpdateRequest
from services.project_service import ProjectService, project_to_dict
from utils.responses import success_json

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
async def list_projects(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    status: str | None = Query(None),
    search: str | None = Query(None),
):
    svc = ProjectService(session)
    items, meta = await svc.list_projects(
        ctx,
        page=page,
        page_size=per_page,
        status=status,
        search=search,
    )
    return success_json(
        message="OK",
        data={"items": items},
        pagination=meta,
    )


@router.post("")
async def create_project(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:manage"))],
    body: ProjectCreateRequest,
):
    svc = ProjectService(session)
    p = await svc.create(ctx, body)
    return success_json(
        message="Project created",
        data=project_to_dict(p),
        status_code=201,
    )


@router.get("/{project_id}")
async def get_project(
    project_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
):
    svc = ProjectService(session)
    p = await svc.get_by_id(ctx, project_id)
    return success_json(message="OK", data=project_to_dict(p))


@router.put("/{project_id}")
async def update_project(
    project_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:manage"))],
    body: ProjectUpdateRequest,
):
    svc = ProjectService(session)
    p = await svc.update(ctx, project_id, body)
    return success_json(message="Project updated", data=project_to_dict(p))


@router.delete("/{project_id}")
async def delete_project(
    project_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:manage"))],
):
    svc = ProjectService(session)
    await svc.soft_delete(ctx, project_id)
    return success_json(message="Project deleted", data={})
