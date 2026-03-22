from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.exceptions import AppException
from core.rbac import RequestContext
from core.security import hash_password
from models.role import Role
from models.user import User
from schemas.user import UserCreateRequest, UserListItem, UserUpdateRequest
from services.audit_service import AuditService
from services.authorization_service import AuthorizationService


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditService(session)

    async def get_by_id(self, ctx: RequestContext, user_id: UUID) -> User:
        result = await self._session.execute(
            select(User)
            .options(selectinload(User.role))
            .where(
                User.id == user_id,
                User.company_id == ctx.company_id,
                User.deleted_at.is_(None),
            )
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise AppException(404, "User not found")
        return user

    async def list_users(
        self,
        ctx: RequestContext,
        *,
        page: int,
        page_size: int,
        q: str | None = None,
    ) -> tuple[list[UserListItem], dict[str, int]]:
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        filters = [
            User.company_id == ctx.company_id,
            User.deleted_at.is_(None),
        ]
        if q and q.strip():
            term = f"%{q.strip()}%"
            filters.append(
                or_(User.full_name.ilike(term), User.email.ilike(term)),
            )
        count_stmt = select(func.count()).select_from(User).where(*filters)
        total = int((await self._session.execute(count_stmt)).scalar_one())
        offset = (page - 1) * page_size
        result = await self._session.execute(
            select(User)
            .options(selectinload(User.role))
            .where(*filters)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        users = result.scalars().all()
        items = [
            UserListItem(
                id=str(u.id),
                full_name=u.full_name,
                email=u.email,
                phone=u.phone,
                role_id=str(u.role_id),
                role_name=u.role.name,
                created_at=u.created_at.isoformat(),
                updated_at=u.updated_at.isoformat(),
            )
            for u in users
        ]
        from utils.pagination import pagination_meta

        return items, pagination_meta(page=page, page_size=page_size, total=total)

    async def create_user(self, ctx: RequestContext, body: UserCreateRequest) -> User:
        if "users:manage" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: users:manage")
        try:
            role_uuid = UUID(body.role_id)
        except ValueError as e:
            raise AppException(400, "Invalid role_id") from e

        role_result = await self._session.execute(
            select(Role)
            .options(selectinload(Role.permissions))
            .where(Role.id == role_uuid, Role.deleted_at.is_(None))
        )
        target_role = role_result.scalar_one_or_none()
        if target_role is None:
            raise AppException(400, "Role not found")

        AuthorizationService.assert_can_assign_role(ctx, target_role)

        email = body.email.lower().strip()
        exists = await self._session.execute(select(User.id).where(User.email == email))
        if exists.scalar_one_or_none() is not None:
            raise AppException(400, "Email already in use", errors={"email": "must be unique"})

        user = User(
            full_name=body.full_name.strip(),
            email=email,
            phone=body.phone,
            password_hash=hash_password(body.password),
            company_id=ctx.company_id,
            role_id=target_role.id,
            is_superuser=False,
        )
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user, ["role"])
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="user.create",
            resource_type="user",
            resource_id=str(user.id),
        )
        return user

    async def update_user(
        self,
        ctx: RequestContext,
        user_id: UUID,
        body: UserUpdateRequest,
    ) -> User:
        if "users:manage" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: users:manage")
        user = await self.get_by_id(ctx, user_id)
        await self._session.refresh(user, ["role"])
        AuthorizationService.assert_can_manage_user(ctx, user)

        if body.email is not None:
            new_email = body.email.lower().strip()
            dup = await self._session.execute(
                select(User.id).where(User.email == new_email, User.id != user.id)
            )
            if dup.scalar_one_or_none() is not None:
                raise AppException(400, "Email already in use")
            user.email = new_email
        if body.full_name is not None:
            user.full_name = body.full_name.strip()
        if body.phone is not None:
            user.phone = body.phone
        user.updated_at = datetime.now(UTC)
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="user.update",
            resource_type="user",
            resource_id=str(user.id),
        )
        return user

    async def soft_delete(self, ctx: RequestContext, user_id: UUID) -> None:
        if "users:manage" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: users:manage")
        user = await self.get_by_id(ctx, user_id)
        await self._session.refresh(user, ["role"])
        AuthorizationService.assert_can_manage_user(ctx, user)
        if user.id == ctx.user_id:
            raise AppException(400, "Cannot delete your own account")
        await AuthorizationService.assert_not_last_owner_removal(
            self._session, ctx.company_id, user
        )
        user.deleted_at = datetime.now(UTC)
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="user.delete",
            resource_type="user",
            resource_id=str(user.id),
        )

    async def change_role(self, ctx: RequestContext, user_id: UUID, role_id: UUID) -> User:
        if "users:manage" not in ctx.permission_codes:
            raise AppException(403, "Missing permission: users:manage")
        user = await self.get_by_id(ctx, user_id)
        await self._session.refresh(user, ["role"])
        AuthorizationService.assert_can_manage_user(ctx, user)

        await AuthorizationService.assert_not_last_owner_removal(
            self._session,
            ctx.company_id,
            user,
            changing_role=True,
        )

        role_result = await self._session.execute(
            select(Role)
            .options(selectinload(Role.permissions))
            .where(Role.id == role_id, Role.deleted_at.is_(None))
        )
        new_role = role_result.scalar_one_or_none()
        if new_role is None:
            raise AppException(400, "Role not found")

        AuthorizationService.assert_can_assign_role(ctx, new_role)
        user.role_id = new_role.id
        await self._session.refresh(user, ["role"])
        await self._audit.log(
            actor_user_id=ctx.user_id,
            company_id=ctx.company_id,
            action="user.role_change",
            resource_type="user",
            resource_id=str(user.id),
            meta={"role_id": str(role_id)},
        )
        return user
