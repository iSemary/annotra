from sqlalchemy import func, select

from core.exceptions import AppException
from core.rbac import RequestContext
from models.role import Role
from models.user import User


class AuthorizationService:
    @staticmethod
    def _active_permission_codes(role: Role) -> frozenset[str]:
        return frozenset(p.code for p in role.permissions if p.deleted_at is None)

    @classmethod
    def assert_can_assign_role(cls, ctx: RequestContext, target_role: Role) -> None:
        if target_role.deleted_at is not None:
            raise AppException(400, "Role is not active")
        if target_role.is_system:
            if target_role.company_id is not None:
                raise AppException(400, "Invalid system role")
        else:
            if target_role.company_id != ctx.company_id:
                raise AppException(403, "Role belongs to another tenant")

        if target_role.hierarchy_level > ctx.hierarchy_level:
            raise AppException(403, "Cannot assign a role above your level")

        target_codes = cls._active_permission_codes(target_role)
        if not target_codes.issubset(ctx.permission_codes):
            raise AppException(403, "Cannot assign a role with permissions you do not have")

    @staticmethod
    def assert_can_manage_user(ctx: RequestContext, target: User) -> None:
        if target.company_id != ctx.company_id:
            raise AppException(404, "User not found")
        if target.id == ctx.user_id:
            return
        t_role = target.role
        if t_role.name == "OWNER" and ctx.role_name != "OWNER":
            raise AppException(403, "Only OWNER may manage another OWNER")

    @staticmethod
    async def count_active_owners(session, company_id) -> int:
        result = await session.execute(
            select(func.count())
            .select_from(User)
            .join(Role, User.role_id == Role.id)
            .where(
                User.company_id == company_id,
                User.deleted_at.is_(None),
                Role.name == "OWNER",
                Role.company_id.is_(None),
                Role.deleted_at.is_(None),
            )
        )
        return int(result.scalar_one())

    @classmethod
    async def assert_not_last_owner_removal(
        cls,
        session,
        company_id,
        target: User,
        *,
        changing_role: bool = False,
    ) -> None:
        t_role = await session.get(Role, target.role_id)
        if t_role is None or t_role.name != "OWNER" or t_role.company_id is not None:
            return
        owners = await cls.count_active_owners(session, company_id)
        if owners <= 1:
            raise AppException(400, "Cannot remove or change the last OWNER of the company")

    @classmethod
    def assert_custom_role_editable(cls, ctx: RequestContext, role: Role) -> None:
        if role.is_system or role.company_id is None:
            raise AppException(400, "System roles cannot be modified")
        if role.company_id != ctx.company_id:
            raise AppException(404, "Role not found")

    @classmethod
    def assert_can_define_custom_role(
        cls,
        ctx: RequestContext,
        *,
        hierarchy_level: int,
    ) -> None:
        if hierarchy_level > ctx.hierarchy_level:
            raise AppException(403, "Custom role level cannot exceed your level")
        if "roles:manage" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: roles:manage")
