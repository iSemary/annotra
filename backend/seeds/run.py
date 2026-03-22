"""CLI wiring: settings, session scope, validation, then pipeline."""

from __future__ import annotations

from core.config import get_settings
from db.session import async_session_maker
from seeds.default_admin_pipeline import run_default_admin_pipeline
from seeds.env_validation import validate_default_admin_settings


async def run_cli() -> int:
    settings = get_settings()
    early = validate_default_admin_settings(settings)
    if early is not None:
        return early
    async with async_session_maker() as session:
        return await run_default_admin_pipeline(session, settings)
