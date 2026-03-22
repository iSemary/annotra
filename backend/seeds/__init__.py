"""Application database seeds.

Run from ``backend/`` after migrations::

    python -m scripts.seed_db

Seed functions take an :class:`sqlalchemy.ext.asyncio.AsyncSession` — the same
async session type used by FastAPI dependencies — so logic stays testable and
consistent with the app stack.
"""
