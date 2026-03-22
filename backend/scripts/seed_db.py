"""CLI entry: run seeds after Alembic (``python -m scripts.seed_db`` from ``backend/``)."""

from __future__ import annotations

import asyncio

from seeds.run import run_cli

if __name__ == "__main__":
    raise SystemExit(asyncio.run(run_cli()))
