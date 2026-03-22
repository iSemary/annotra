import math
from typing import Any, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

T = TypeVar("T")


def pagination_meta(*, page: int, page_size: int, total: int) -> dict[str, int]:
    total_pages = max(1, math.ceil(total / page_size)) if total else 0
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


async def paginate_select(
    session: AsyncSession,
    base_query: Select[tuple[T]],
    *,
    page: int,
    page_size: int,
) -> tuple[list[T], dict[str, int]]:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    count_q = select(func.count()).select_from(base_query.subquery())
    total = int((await session.execute(count_q)).scalar_one())
    offset = (page - 1) * page_size
    result = await session.execute(base_query.offset(offset).limit(page_size))
    items = list(result.scalars().all())
    return items, pagination_meta(page=page, page_size=page_size, total=total)
