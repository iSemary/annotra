"""Verify RBAC data from Alembic migration before tenant/user seeds."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.permission import Permission
from models.role import Role


class RbacNotSeededError(RuntimeError):
    """Raised when migration ``001_initial_schema_and_rbac_seed`` has not been applied."""


async def verify_permissions_seeded(session: AsyncSession) -> None:
    count = await session.scalar(
        select(func.count()).select_from(Permission).where(
            Permission.deleted_at.is_(None)
        )
    )
    if not count:
        raise RbacNotSeededError(
            "No permissions found. Run: cd backend && alembic upgrade head"
        )


async def get_system_owner_role(session: AsyncSession) -> Role:
    result = await session.execute(
        select(Role).where(
            Role.name == "OWNER",
            Role.company_id.is_(None),
            Role.deleted_at.is_(None),
        )
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise RbacNotSeededError(
            "System role OWNER missing. Run: cd backend && alembic upgrade head"
        )
    return role


async def ensure_rbac_prerequisites(session: AsyncSession) -> Role:
    """Confirm permissions and system OWNER exist; return OWNER for tenant bootstrap."""
    await verify_permissions_seeded(session)
    return await get_system_owner_role(session)
