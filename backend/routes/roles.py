from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.rbac import RequestContext, require_permission
from db.session import get_async_session
from schemas.common import PaginationQuery
from schemas.role import RoleCreateRequest, RoleUpdateRequest
from services.role_service import RoleService
from utils.responses import success_json

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("")
async def list_roles(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("roles:read"))],
    pagination: Annotated[PaginationQuery, Depends()],
):
    svc = RoleService(session)
    items, meta = await svc.list_roles(ctx, page=pagination.page, page_size=pagination.page_size)
    return success_json(
        message="OK",
        data={"items": [i.model_dump() for i in items]},
        pagination=meta,
    )


@router.post("")
async def create_role(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("roles:manage"))],
    body: RoleCreateRequest,
):
    svc = RoleService(session)
    out = await svc.create_role(ctx, body)
    return success_json(message="Role created", data=out.model_dump(), status_code=201)


@router.get("/{role_id}")
async def get_role(
    role_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("roles:read"))],
):
    svc = RoleService(session)
    out = await svc.get_role(ctx, role_id)
    return success_json(message="OK", data=out.model_dump())


@router.put("/{role_id}")
async def update_role(
    role_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("roles:manage"))],
    body: RoleUpdateRequest,
):
    svc = RoleService(session)
    out = await svc.update_role(ctx, role_id, body)
    return success_json(message="Role updated", data=out.model_dump())


@router.delete("/{role_id}")
async def delete_role(
    role_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("roles:manage"))],
):
    svc = RoleService(session)
    await svc.delete_role(ctx, role_id)
    return success_json(message="Role deleted", data={})
