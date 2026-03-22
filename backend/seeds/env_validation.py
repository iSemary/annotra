"""Validate settings required for the default-admin seed pipeline."""

from __future__ import annotations

import re
import sys

from core.config import Settings

_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def validate_default_admin_settings(settings: Settings) -> int | None:
    """Return a process exit code to stop early, or ``None`` if validation passed."""
    email = (settings.DEFAULT_ADMIN_EMAIL or "").strip().lower()
    password = settings.DEFAULT_ADMIN_PASSWORD or ""

    if not email or not password:
        print(
            "Seed skipped: set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in backend/.env"
        )
        return 0

    if len(password) < 8:
        print(
            "Error: DEFAULT_ADMIN_PASSWORD must be at least 8 characters",
            file=sys.stderr,
        )
        return 1

    phone = (settings.DEFAULT_ADMIN_PHONE or "").strip()
    if not _E164_RE.match(phone):
        print(
            "Error: DEFAULT_ADMIN_PHONE must be E.164 (e.g. +15551234567)",
            file=sys.stderr,
        )
        return 1

    return None
