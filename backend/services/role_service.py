from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.exceptions import AppException
from core.rbac import RequestContext
from models.permission import Permission
from models.role import Role
from models.user import User
from schemas.role import RoleCreateRequest, RoleOut, RoleUpdateRequest
from services.audit_service import AuditService
from services.authorization_service import AuthorizationService


class RoleService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditService(session)

    def _to_out(self, role: Role) -> RoleOut:
        codes = sorted(
            p.code for p in role.permissions if p.deleted_at is None
        )
        return RoleOut(
            id=str(role.id),
            name=role.name,
            hierarchy_level=role.hierarchy_level,
            is_system=role.is_system,
            company_id=str(role.company_id) if role.company_id else None,
            permission_codes=codes,
        )

    async def _load_permissions_by_ids(
        self, ids: list[UUID]
    ) -> list[Permission]:
        if not ids:
            return []
        result = await self._session.execute(
            select(Permission).where(
                Permission.id.in_(ids),
                Permission.deleted_at.is_(None),
            )
        )
        found = list(result.scalars().all())
        if len(found) != len(set(ids)):
            raise AppException(400, "One or more permission_ids are invalid")
        return found

    def _assert_permission_subset(self, ctx: RequestContext, perms: list[Permission]) -> None:
        codes = {p.code for p in perms}
        if not codes.issubset(ctx.permission_codes):
            raise AppException(403, "Cannot include permissions you do not have")

    async def list_roles(
        self,
        ctx: RequestContext,
        *,
        page: int,
        page_size: int,
    ) -> tuple[list[RoleOut], dict[str, int]]:
        if "roles:read" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: roles:read")
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        filters = [
            Role.deleted_at.is_(None),
            or_(Role.company_id.is_(None), Role.company_id == ctx.company_id),
        ]
        count_stmt = select(func.count()).select_from(Role).where(*filters)
        total = int((await self._session.execute(count_stmt)).scalar_one())
        offset = (page - 1) * page_size
        result = await self._session.execute(
            select(Role)
            .options(selectinload(Role.permissions))
            .where(*filters)
            .order_by(Role.hierarchy_level.desc(), Role.name)
            .offset(offset)
            .limit(page_size)
        )
        roles = result.scalars().all()
        from utils.pagination import pagination_meta

        return [self._to_out(r) for r in roles], pagination_meta(
            page=page, page_size=page_size, total=total
        )

    async def get_role(self, ctx: RequestContext, role_id: UUID) -> RoleOut:
        if "roles:read" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: roles:read")
        result = await self._session.execute(
            select(Role)
            .options(selectinload(Role.permissions))
            .where(
                Role.id == role_id,
                Role.deleted_at.is_(None),
                or_(Role.company_id.is_(None), Role.company_id == ctx.company_id),
            )
        )
        role = result.scalar_one_or_none()
        if role is None:
            raise AppException(404, "Role not found")
        return self._to_out(role)

    async def create_role(self, ctx: RequestContext, body: RoleCreateRequest) -> RoleOut:
        AuthorizationService.assert_can_define_custom_role(
            ctx, hierarchy_level=body.hierarchy_level
        )
        try:
            pids = [UUID(x) for x in body.permission_ids]
        except ValueError as e:
            raise AppException(400, "Invalid permission_id") from e
        perms = await self._load_permissions_by_ids(pids)
        self._assert_permission_subset(ctx, perms)

        dup = await self._session.execute(
            select(Role.id).where(
                Role.company_id == ctx.company_id,
                Role.name == body.name.strip(),
                Role.deleted_at.is_(None),
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise AppException(400, "Role name already exists for this company")

        role = Role(
            company_id=ctx.company_id,
            name=body.name.strip(),
            hierarchy_level=body.hierarchy_level,
            is_system=False,
        )
        role.permissions = perms
        self._session.add(role)
        await self._session.flush()
        await self._session.refresh(role, ["permissions"])
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="role.create",
            resource_type="role",
            resource_id=str(role.id),
        )
        return self._to_out(role)

    async def update_role(
        self, ctx: RequestContext, role_id: UUID, body: RoleUpdateRequest
    ) -> RoleOut:
        if "roles:manage" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: roles:manage")
        result = await self._session.execute(
            select(Role)
            .options(selectinload(Role.permissions))
            .where(Role.id == role_id, Role.deleted_at.is_(None))
        )
        role = result.scalar_one_or_none()
        if role is None:
            raise AppException(404, "Role not found")
        AuthorizationService.assert_custom_role_editable(ctx, role)

        if body.name is not None:
            dup = await self._session.execute(
                select(Role.id).where(
                    Role.company_id == ctx.company_id,
                    Role.name == body.name.strip(),
                    Role.id != role.id,
                    Role.deleted_at.is_(None),
                )
            )
            if dup.scalar_one_or_none() is not None:
                raise AppException(400, "Role name already exists for this company")
            role.name = body.name.strip()

        if body.hierarchy_level is not None:
            AuthorizationService.assert_can_define_custom_role(
                ctx, hierarchy_level=body.hierarchy_level
            )
            role.hierarchy_level = body.hierarchy_level

        if body.permission_ids is not None:
            try:
                pids = [UUID(x) for x in body.permission_ids]
            except ValueError as e:
                raise AppException(400, "Invalid permission_id") from e
            perms = await self._load_permissions_by_ids(pids)
            self._assert_permission_subset(ctx, perms)
            role.permissions = perms

        await self._session.flush()
        await self._session.refresh(role, ["permissions"])
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="role.update",
            resource_type="role",
            resource_id=str(role.id),
        )
        return self._to_out(role)

    async def delete_role(self, ctx: RequestContext, role_id: UUID) -> None:
        if "roles:manage" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: roles:manage")
        result = await self._session.execute(
            select(Role).where(Role.id == role_id, Role.deleted_at.is_(None))
        )
        role = result.scalar_one_or_none()
        if role is None:
            raise AppException(404, "Role not found")
        AuthorizationService.assert_custom_role_editable(ctx, role)

        in_use = await self._session.execute(
            select(func.count()).select_from(User).where(
                User.role_id == role.id,
                User.deleted_at.is_(None),
            )
        )
        if int(in_use.scalar_one()) > 0:
            raise AppException(400, "Role is assigned to users; reassign them first")

        role.deleted_at = datetime.now(UTC)
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="role.delete",
            resource_type="role",
            resource_id=str(role.id),
        )
