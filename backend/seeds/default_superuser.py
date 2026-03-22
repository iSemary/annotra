"""Seed the platform superuser for a tenant (hashed password, OWNER role)."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from core.security import hash_password
from models.user import User


async def seed_platform_superuser(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    owner_role_id: uuid.UUID,
    email: str,
    password_plain: str,
    phone: str,
    full_name: str,
) -> User:
    user = User(
        full_name=full_name,
        email=email,
        phone=phone,
        password_hash=hash_password(password_plain),
        company_id=company_id,
        role_id=owner_role_id,
        is_superuser=True,
    )
    session.add(user)
    await session.flush()
    return user
