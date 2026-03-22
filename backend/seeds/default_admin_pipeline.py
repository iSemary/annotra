"""Orchestrate default company + platform superuser seeds."""

from __future__ import annotations

import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings
from models.user import User
from seeds.default_company import seed_default_company
from seeds.default_superuser import seed_platform_superuser
from seeds.rbac_prerequisites import RbacNotSeededError, ensure_rbac_prerequisites


async def run_default_admin_pipeline(session: AsyncSession, settings: Settings) -> int:
    email = (settings.DEFAULT_ADMIN_EMAIL or "").strip().lower()
    password = settings.DEFAULT_ADMIN_PASSWORD or ""
    phone = (settings.DEFAULT_ADMIN_PHONE or "").strip()
    full_name = (settings.DEFAULT_ADMIN_FULL_NAME or "Super Admin").strip() or "Super Admin"

    try:
        owner_role = await ensure_rbac_prerequisites(session)
    except RbacNotSeededError as e:
        print(str(e), file=sys.stderr)
        return 1

    existing = await session.execute(select(User.id).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        print(f"Seed skipped: user already exists ({email})")
        return 0

    company = await seed_default_company(session, settings.DEFAULT_COMPANY_NAME)
    await seed_platform_superuser(
        session,
        company_id=company.id,
        owner_role_id=owner_role.id,
        email=email,
        password_plain=password,
        phone=phone,
        full_name=full_name,
    )
    await session.commit()
    print(
        f"Seeded company {company.name!r} (slug={company.slug!r}) and superuser {email!r}"
    )
    return 0
