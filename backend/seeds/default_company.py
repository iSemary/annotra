"""Seed the default tenant company (slug deduplicated like registration)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from models.company import Company
from utils.slug import slugify_company_name, unique_company_slug


async def seed_default_company(session: AsyncSession, company_name: str) -> Company:
    name = (company_name or "Annotra").strip() or "Annotra"
    base_slug = slugify_company_name(name)
    slug = await unique_company_slug(session, base_slug)
    company = Company(name=name, slug=slug)
    session.add(company)
    await session.flush()
    return company
