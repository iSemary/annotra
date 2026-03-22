from __future__ import annotations

import secrets
from uuid import UUID

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import AppException
from core.rbac import RequestContext
from models.user import User
from utils.two_factor_storage import decrypt_recovery_codes, encrypt_recovery_codes


class TwoFactorService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _load_user(self, ctx: RequestContext) -> User:
        user = await self._session.get(User, ctx.user_id)
        if user is None or user.deleted_at is not None:
            raise AppException(401, "User not found")
        if user.company_id != ctx.company_id:
            raise AppException(403, "Tenant mismatch")
        return user

    async def setup(self, ctx: RequestContext) -> dict[str, str]:
        user = await self._load_user(ctx)
        if user.two_factor_enabled:
            raise AppException(400, "Two-factor authentication is already enabled")
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name=user.email, issuer_name="Annotra")
        return {"secret": secret, "qr_code_url": uri}

    async def confirm_setup(
        self,
        ctx: RequestContext,
        *,
        code: str,
        secret: str,
    ) -> list[str]:
        user = await self._load_user(ctx)
        if user.two_factor_enabled:
            raise AppException(400, "Two-factor authentication is already enabled")
        totp = pyotp.TOTP(secret)
        if not totp.verify(code.strip(), valid_window=1):
            raise AppException(422, "Invalid verification code")
        recovery = [secrets.token_hex(5) for _ in range(8)]
        user.totp_secret = secret
        user.two_factor_enabled = True
        user.two_factor_recovery_cipher = encrypt_recovery_codes(recovery)
        await self._session.flush()
        return recovery

    async def disable(self, ctx: RequestContext) -> None:
        user = await self._load_user(ctx)
        user.two_factor_enabled = False
        user.totp_secret = None
        user.two_factor_recovery_cipher = None
        await self._session.flush()

    async def get_recovery_codes(self, ctx: RequestContext) -> list[str]:
        user = await self._load_user(ctx)
        if not user.two_factor_enabled or not user.two_factor_recovery_cipher:
            return []
        try:
            return decrypt_recovery_codes(user.two_factor_recovery_cipher)
        except Exception as exc:  # noqa: BLE001
            raise AppException(500, "Could not read recovery codes") from exc

    async def try_consume_recovery_code(self, user: User, code: str) -> bool:
        if not user.two_factor_recovery_cipher:
            return False
        try:
            codes = decrypt_recovery_codes(user.two_factor_recovery_cipher)
        except Exception:
            return False
        normalized = code.strip().lower()
        for i, c in enumerate(codes):
            if c.lower() == normalized:
                codes.pop(i)
                user.two_factor_recovery_cipher = (
                    encrypt_recovery_codes(codes) if codes else None
                )
                await self._session.flush()
                return True
        return False
