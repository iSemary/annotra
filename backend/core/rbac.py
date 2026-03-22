from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.exceptions import AppException
from core.security import decode_access_token
from db.session import get_async_session
from models.company import Company
from models.role import Role
from models.user import User

http_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class RequestContext:
    user_id: UUID
    company_id: UUID
    company_slug: str
    role_id: UUID
    role_name: str
    hierarchy_level: int
    permission_codes: frozenset[str]
    is_superuser: bool
    user: User


async def build_request_context(token: str, session: AsyncSession) -> RequestContext:
    try:
        payload = decode_access_token(token)
    except ValueError as e:
        raise AppException(401, str(e)) from e
    if payload.get("typ") != "access":
        raise AppException(401, "Invalid token type")
    try:
        user_id = UUID(payload["sub"])
        company_id = UUID(payload["company_id"])
        role_id = UUID(payload["role_id"])
    except (KeyError, ValueError) as e:
        raise AppException(401, "Invalid token claims") from e

    result = await session.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions))
        .where(User.id == user_id, User.deleted_at.is_(None)),
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise AppException(401, "User not found")

    if user.company_id != company_id:
        raise AppException(403, "Tenant mismatch")
    if user.role_id != role_id:
        raise AppException(401, "Token does not match current role; please sign in again")

    role = user.role
    if role.deleted_at is not None:
        raise AppException(401, "Role is inactive")
    if role.company_id is not None and role.company_id != user.company_id:
        raise AppException(403, "Invalid role for tenant")

    company = await session.get(Company, user.company_id)
    if company is None or company.deleted_at is not None:
        raise AppException(403, "Company not found")

    codes = frozenset(p.code for p in role.permissions if p.deleted_at is None)

    return RequestContext(
        user_id=user.id,
        company_id=user.company_id,
        company_slug=company.slug,
        role_id=user.role_id,
        role_name=role.name,
        hierarchy_level=role.hierarchy_level,
        permission_codes=codes,
        is_superuser=user.is_superuser,
        user=user,
    )


async def get_current_context(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(http_bearer)],
    session: Annotated[AsyncSession, Depends(get_async_session)],
) -> RequestContext:
    if credentials is None or not credentials.credentials:
        raise AppException(401, "Not authenticated")
    return await build_request_context(credentials.credentials, session)


async def get_current_context_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(http_bearer)],
    session: Annotated[AsyncSession, Depends(get_async_session)],
) -> RequestContext | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return await build_request_context(credentials.credentials, session)
    except AppException:
        return None


def require_permission(code: str):
    async def checker(ctx: Annotated[RequestContext, Depends(get_current_context)]) -> RequestContext:
        if code not in ctx.permission_codes:
            raise AppException(403, f"Missing permission: {code}")
        return ctx

    return checker


def require_any_permission(*codes: str):
    async def checker(ctx: Annotated[RequestContext, Depends(get_current_context)]) -> RequestContext:
        if not any(c in ctx.permission_codes for c in codes):
            raise AppException(403, "Insufficient permissions")
        return ctx

    return checker


def require_roles(*names: str):
    allowed = frozenset(names)

    async def checker(ctx: Annotated[RequestContext, Depends(get_current_context)]) -> RequestContext:
        if ctx.role_name not in allowed:
            raise AppException(403, "Insufficient role")
        return ctx

    return checker


async def require_superuser(
    ctx: Annotated[RequestContext, Depends(get_current_context)],
) -> RequestContext:
    if not ctx.is_superuser:
        raise AppException(403, "Superuser required")
    return ctx
