from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from core.exceptions import AppException
from core.rbac import RequestContext
from models.permission import Permission
from models.role import role_permission_table
from schemas.permission import PermissionCreateRequest, PermissionOut, PermissionUpdateRequest
from services.audit_service import AuditService


class PermissionService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditService(session)

    def _to_out(self, p: Permission) -> PermissionOut:
        return PermissionOut(id=str(p.id), code=p.code, description=p.description)

    async def list_permissions(
        self,
        ctx: RequestContext,
        *,
        page: int,
        page_size: int,
        code_prefix: str | None = None,
    ) -> tuple[list[PermissionOut], dict[str, int]]:
        if "roles:read" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: roles:read")
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        filters = [Permission.deleted_at.is_(None)]
        if code_prefix and code_prefix.strip():
            filters.append(Permission.code.ilike(f"{code_prefix.strip()}%"))
        count_stmt = select(func.count()).select_from(Permission).where(*filters)
        total = int((await self._session.execute(count_stmt)).scalar_one())
        offset = (page - 1) * page_size
        result = await self._session.execute(
            select(Permission)
            .where(*filters)
            .order_by(Permission.code)
            .offset(offset)
            .limit(page_size)
        )
        rows = result.scalars().all()
        from utils.pagination import pagination_meta

        return [self._to_out(p) for p in rows], pagination_meta(
            page=page, page_size=page_size, total=total
        )

    async def get_permission(self, ctx: RequestContext, perm_id: UUID) -> PermissionOut:
        if "roles:read" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: roles:read")
        p = await self._session.get(Permission, perm_id)
        if p is None or p.deleted_at is not None:
            raise AppException(404, "Permission not found")
        return self._to_out(p)

    async def create_permission(
        self, ctx: RequestContext, body: PermissionCreateRequest
    ) -> PermissionOut:
        if not ctx.is_superuser:
            raise AppException(403, "Superuser required")
        code = body.code.strip()
        exists = await self._session.execute(
            select(Permission.id).where(Permission.code == code, Permission.deleted_at.is_(None))
        )
        if exists.scalar_one_or_none() is not None:
            raise AppException(400, "Permission code already exists")
        p = Permission(code=code, description=body.description)
        self._session.add(p)
        await self._session.flush()
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="permission.create",
            resource_type="permission",
            resource_id=str(p.id),
        )
        return self._to_out(p)

    async def update_permission(
        self, ctx: RequestContext, perm_id: UUID, body: PermissionUpdateRequest
    ) -> PermissionOut:
        if not ctx.is_superuser:
            raise AppException(403, "Superuser required")
        p = await self._session.get(Permission, perm_id)
        if p is None or p.deleted_at is not None:
            raise AppException(404, "Permission not found")
        if body.description is not None:
            p.description = body.description
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="permission.update",
            resource_type="permission",
            resource_id=str(p.id),
        )
        return self._to_out(p)

    async def delete_permission(self, ctx: RequestContext, perm_id: UUID) -> None:
        if not ctx.is_superuser:
            raise AppException(403, "Superuser required")
        p = await self._session.get(Permission, perm_id)
        if p is None or p.deleted_at is not None:
            raise AppException(404, "Permission not found")
        linked = await self._session.execute(
            select(func.count()).select_from(role_permission_table).where(
                role_permission_table.c.permission_id == perm_id
            )
        )
        if int(linked.scalar_one()) > 0:
            raise AppException(400, "Permission is still linked to roles; remove links first")
        p.deleted_at = datetime.now(UTC)
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="permission.delete",
            resource_type="permission",
            resource_id=str(p.id),
        )
