from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import pyotp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.config import get_settings
from core.exceptions import AppException
from core.rbac import RequestContext
from core.security import (
    create_access_token,
    create_two_factor_pending_token,
    decode_two_factor_pending_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token_value,
    verify_password,
)
from models.company import Company
from models.permission import Permission
from models.refresh_token import RefreshToken
from models.role import Role
from models.user import User
from schemas.auth import AuthTokensData, LoginRequest, RegisterRequest, UserPublic
from services.audit_service import AuditService
from services.two_factor_service import TwoFactorService
from utils.slug import slugify_company_name, unique_company_slug


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditService(session)

    async def _get_system_role(self, name: str) -> Role:
        result = await self._session.execute(
            select(Role).where(
                Role.name == name,
                Role.company_id.is_(None),
                Role.deleted_at.is_(None),
            )
        )
        role = result.scalar_one_or_none()
        if role is None:
            raise AppException(500, f"System role {name} not seeded")
        return role

    def _user_public(self, user: User, slug: str) -> UserPublic:
        settings = get_settings()
        return UserPublic(
            id=str(user.id),
            full_name=user.full_name,
            email=user.email,
            phone=user.phone,
            company_id=str(user.company_id),
            role=user.role.name,
            role_id=str(user.role_id),
            slug=slug,
            is_superuser=user.is_superuser,
            two_factor_enabled=user.two_factor_enabled,
            two_factor_feature_enabled=settings.TWO_FACTOR_ENABLED,
        )

    async def _permission_codes_for_user(self, user: User) -> frozenset[str]:
        result = await self._session.execute(
            select(User)
            .options(selectinload(User.role).selectinload(Role.permissions))
            .where(User.id == user.id),
        )
        u = result.scalar_one()
        role = u.role
        codes = frozenset(p.code for p in role.permissions if p.deleted_at is None)
        if u.is_superuser:
            r = await self._session.execute(
                select(Permission.code).where(Permission.deleted_at.is_(None)),
            )
            codes = frozenset(r.scalars().all())
        return codes

    async def _user_public_with_permissions(self, user: User, slug: str) -> UserPublic:
        base = self._user_public(user, slug)
        perms = sorted(await self._permission_codes_for_user(user))
        return base.model_copy(update={"permissions": perms})

    async def _issue_tokens(self, user: User, slug: str) -> tuple[str, str, RefreshToken]:
        access = create_access_token(
            subject=user.id,
            company_id=user.company_id,
            role_id=user.role_id,
            role_name=user.role.name,
            slug=slug,
        )
        raw_refresh = new_refresh_token_value()
        settings = get_settings()
        expires = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        rt = RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=expires,
            revoked=False,
        )
        self._session.add(rt)
        await self._session.flush()
        return access, raw_refresh, rt

    async def register(self, body: RegisterRequest) -> tuple[AuthTokensData, str]:
        email = body.email.lower().strip()
        existing = await self._session.execute(select(User.id).where(User.email == email))
        if existing.scalar_one_or_none() is not None:
            raise AppException(400, "Email already registered", errors={"email": "must be unique"})

        base_slug = slugify_company_name(body.company_name)
        slug = await unique_company_slug(self._session, base_slug)

        company = Company(name=body.company_name.strip(), slug=slug)
        self._session.add(company)
        await self._session.flush()

        owner_role = await self._get_system_role("OWNER")
        user = User(
            full_name=body.full_name.strip(),
            email=email,
            phone=body.phone,
            password_hash=hash_password(body.password),
            company_id=company.id,
            role_id=owner_role.id,
            is_superuser=False,
        )
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user, ["role"])

        access, raw_refresh, _ = await self._issue_tokens(user, slug)
        await self._audit.log(
            actor_user_id=user.id,
            company_id=company.id,
            action="register",
            resource_type="user",
            resource_id=str(user.id),
        )
        data = AuthTokensData(
            access_token=access,
            user=await self._user_public_with_permissions(user, slug),
        )
        return data, raw_refresh

    async def login(self, body: LoginRequest) -> tuple[AuthTokensData, str] | dict[str, Any]:
        email = body.email.lower().strip()
        result = await self._session.execute(
            select(User)
            .where(User.email == email, User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        if user is None or not verify_password(body.password, user.password_hash):
            raise AppException(401, "Invalid email or password")

        company = await self._session.get(Company, user.company_id)
        if company is None or company.deleted_at is not None:
            raise AppException(403, "Company is inactive")

        await self._session.refresh(user, ["role"])
        settings = get_settings()
        if (
            settings.TWO_FACTOR_ENABLED
            and user.two_factor_enabled
            and user.totp_secret
        ):
            temp = create_two_factor_pending_token(
                subject=user.id,
                company_id=user.company_id,
            )
            return {
                "requires_2fa": True,
                "temp_token": temp,
                "message": "Two-factor authentication required",
            }

        access, raw_refresh, _ = await self._issue_tokens(user, company.slug)
        await self._audit.log(
            actor_user_id=user.id,
            company_id=user.company_id,
            action="login",
            resource_type="user",
            resource_id=str(user.id),
        )
        data = AuthTokensData(
            access_token=access,
            user=await self._user_public_with_permissions(user, company.slug),
        )
        return data, raw_refresh

    async def complete_two_factor_login(
        self,
        temp_token: str,
        code: str,
    ) -> tuple[AuthTokensData, str]:
        if not get_settings().TWO_FACTOR_ENABLED:
            raise AppException(
                403,
                "Two-factor authentication is disabled on this server",
            )
        payload = decode_two_factor_pending_token(temp_token)
        user_id = UUID(payload["sub"])
        company_id = UUID(payload["company_id"])
        user = await self._session.get(User, user_id)
        if user is None or user.deleted_at is not None:
            raise AppException(401, "User not found")
        if user.company_id != company_id:
            raise AppException(401, "Invalid session")
        await self._session.refresh(user, ["role"])
        if not user.two_factor_enabled or not user.totp_secret:
            raise AppException(400, "Two-factor authentication is not enabled")

        code_stripped = code.strip().replace(" ", "")
        totp = pyotp.TOTP(user.totp_secret)
        tf_svc = TwoFactorService(self._session)
        if not totp.verify(code_stripped, valid_window=1):
            if not await tf_svc.try_consume_recovery_code(user, code_stripped):
                raise AppException(422, "Invalid verification code")

        company = await self._session.get(Company, user.company_id)
        if company is None or company.deleted_at is not None:
            raise AppException(403, "Company is inactive")

        access, raw_refresh, _ = await self._issue_tokens(user, company.slug)
        await self._audit.log(
            actor_user_id=user.id,
            company_id=user.company_id,
            action="login",
            resource_type="user",
            resource_id=str(user.id),
        )
        data = AuthTokensData(
            access_token=access,
            user=await self._user_public_with_permissions(user, company.slug),
        )
        return data, raw_refresh

    async def get_me(self, ctx: RequestContext) -> dict[str, Any]:
        user = await self._session.get(User, ctx.user_id)
        if user is None or user.deleted_at is not None:
            raise AppException(401, "User not found")
        await self._session.refresh(user, ["role"])
        pub = self._user_public(user, ctx.company_slug)
        out = pub.model_dump()
        out["permissions"] = sorted(ctx.permission_codes)
        return out

    async def refresh(self, raw_cookie_token: str | None) -> tuple[AuthTokensData, str]:
        if not raw_cookie_token:
            raise AppException(401, "Missing refresh token")
        th = hash_refresh_token(raw_cookie_token)
        result = await self._session.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == th,
                RefreshToken.revoked.is_(False),
            )
        )
        old = result.scalar_one_or_none()
        if old is None:
            raise AppException(401, "Invalid refresh token")
        if old.expires_at < datetime.now(UTC):
            raise AppException(401, "Refresh token expired")

        user = await self._session.get(User, old.user_id)
        if user is None or user.deleted_at is not None:
            raise AppException(401, "User is inactive")
        company = await self._session.get(Company, user.company_id)
        if company is None or company.deleted_at is not None:
            raise AppException(403, "Company is inactive")

        await self._session.refresh(user, ["role"])

        old.revoked = True
        access, new_raw, new_rt = await self._issue_tokens(user, company.slug)
        old.replaced_by_id = new_rt.id

        data = AuthTokensData(
            access_token=access,
            user=await self._user_public_with_permissions(user, company.slug),
        )
        return data, new_raw

    async def logout(
        self,
        raw_cookie_token: str | None,
        *,
        actor_user_id: UUID | None = None,
        company_id: UUID | None = None,
    ) -> None:
        if raw_cookie_token:
            th = hash_refresh_token(raw_cookie_token)
            result = await self._session.execute(
                select(RefreshToken).where(RefreshToken.token_hash == th)
            )
            row = result.scalar_one_or_none()
            if row:
                row.revoked = True
        if actor_user_id:
            await self._audit.log(
                actor_user_id=actor_user_id,
                company_id=company_id,
                action="logout",
                resource_type="session",
                resource_id=None,
            )
