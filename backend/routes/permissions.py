from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.rbac import RequestContext, require_permission, require_superuser
from db.session import get_async_session
from schemas.common import PaginationQuery
from schemas.permission import PermissionCreateRequest, PermissionUpdateRequest
from services.permission_service import PermissionService
from utils.responses import success_json

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("")
async def list_permissions(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("roles:read"))],
    pagination: Annotated[PaginationQuery, Depends()],
    code_prefix: str | None = Query(default=None),
):
    svc = PermissionService(session)
    items, meta = await svc.list_permissions(
        ctx,
        page=pagination.page,
        page_size=pagination.page_size,
        code_prefix=code_prefix,
    )
    return success_json(
        message="OK",
        data={"items": [i.model_dump() for i in items]},
        pagination=meta,
    )


@router.get("/{permission_id}")
async def get_permission(
    permission_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("roles:read"))],
):
    svc = PermissionService(session)
    out = await svc.get_permission(ctx, permission_id)
    return success_json(message="OK", data=out.model_dump())


@router.post("")
async def create_permission(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_superuser)],
    body: PermissionCreateRequest,
):
    svc = PermissionService(session)
    out = await svc.create_permission(ctx, body)
    return success_json(message="Permission created", data=out.model_dump(), status_code=201)


@router.patch("/{permission_id}")
async def update_permission(
    permission_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_superuser)],
    body: PermissionUpdateRequest,
):
    svc = PermissionService(session)
    out = await svc.update_permission(ctx, permission_id, body)
    return success_json(message="Permission updated", data=out.model_dump())


@router.delete("/{permission_id}")
async def delete_permission(
    permission_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_superuser)],
):
    svc = PermissionService(session)
    await svc.delete_permission(ctx, permission_id)
    return success_json(message="Permission deleted", data={})
