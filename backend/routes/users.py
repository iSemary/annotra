from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.rbac import RequestContext, require_permission
from db.session import get_async_session
from schemas.common import PaginationQuery
from schemas.user import UserCreateRequest, UserRolePatchRequest, UserUpdateRequest
from services.user_service import UserService
from utils.responses import success_json

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("users:read"))],
    pagination: Annotated[PaginationQuery, Depends()],
    q: str | None = Query(default=None),
):
    svc = UserService(session)
    items, meta = await svc.list_users(
        ctx, page=pagination.page, page_size=pagination.page_size, q=q
    )
    return success_json(
        message="OK",
        data={"items": [i.model_dump() for i in items]},
        pagination=meta,
    )


@router.post("")
async def create_user(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("users:manage"))],
    body: UserCreateRequest,
):
    svc = UserService(session)
    user = await svc.create_user(ctx, body)
    return success_json(
        message="User created",
        data={
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "role_id": str(user.role_id),
            "role_name": user.role.name,
        },
        status_code=201,
    )


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("users:read"))],
):
    svc = UserService(session)
    user = await svc.get_by_id(ctx, user_id)
    await session.refresh(user, ["role"])
    return success_json(
        message="OK",
        data={
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "role_id": str(user.role_id),
            "role_name": user.role.name,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat(),
        },
    )


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("users:manage"))],
    body: UserUpdateRequest,
):
    svc = UserService(session)
    user = await svc.update_user(ctx, user_id, body)
    await session.refresh(user, ["role"])
    return success_json(
        message="User updated",
        data={
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "role_id": str(user.role_id),
            "role_name": user.role.name,
        },
    )


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("users:manage"))],
):
    svc = UserService(session)
    await svc.soft_delete(ctx, user_id)
    return success_json(message="User deleted", data={})


@router.patch("/{user_id}/role")
async def patch_user_role(
    user_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("users:manage"))],
    body: UserRolePatchRequest,
):
    from core.exceptions import AppException

    svc = UserService(session)
    try:
        role_uuid = UUID(body.role_id)
    except ValueError as e:
        raise AppException(400, "Invalid role_id") from e
    user = await svc.change_role(ctx, user_id, role_uuid)
    await session.refresh(user, ["role"])
    return success_json(
        message="Role updated",
        data={
            "id": str(user.id),
            "role_id": str(user.role_id),
            "role_name": user.role.name,
        },
    )
