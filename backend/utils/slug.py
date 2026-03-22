import re


def slugify_company_name(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "company"


async def unique_company_slug(session, base_slug: str) -> str:
    """Append short suffix if slug exists on non-deleted companies."""
    from sqlalchemy import select

    from models.company import Company

    slug = base_slug
    for n in range(0, 50):
        candidate = slug if n == 0 else f"{slug}-{n}"
        q = await session.execute(
            select(Company.id).where(
                Company.slug == candidate,
                Company.deleted_at.is_(None),
            )
        )
        if q.scalar_one_or_none() is None:
            return candidate
    return f"{slug}-x"
