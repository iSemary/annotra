"""Post-create pipeline for annotation assets (in-process or external queue)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import BackgroundTasks

from core.config import get_settings
from db.session import async_session_maker
from models.annotation_asset import AnnotationAsset

log = logging.getLogger("annotra.annotation_asset")


async def process_annotation_asset_after_create(asset_id: UUID) -> None:
    """Run ingest / validation; moves asset from in_progress → completed or failed."""
    try:
        async with async_session_maker() as session:
            asset = await session.get(AnnotationAsset, asset_id)
            if asset is None or asset.status != "in_progress":
                return
            # Placeholder for real work (transcode, virus scan, thumbnails, …).
            # Audio: keep in_progress until segments exist (manual or HF pipeline later).
            if asset.file_type == "audio":
                asset.status = "in_progress"
            else:
                asset.status = "completed"
            asset.updated_at = datetime.now(UTC)
            await session.commit()
    except Exception:
        log.exception("annotation asset pipeline failed id=%s", asset_id)
        try:
            async with async_session_maker() as session:
                asset = await session.get(AnnotationAsset, asset_id)
                if asset is not None and asset.status == "in_progress":
                    asset.status = "failed"
                    asset.updated_at = datetime.now(UTC)
                    await session.commit()
        except Exception:
            log.exception("could not mark annotation asset failed id=%s", asset_id)


async def schedule_annotation_asset_pipeline(
    asset_id: UUID,
    *,
    background_tasks: BackgroundTasks,
) -> None:
    """
    Dispatch post-create processing based on ANNOTATION_ASSET_PIPELINE_MODE.

    - inline / immediate: await in the current request (default).
    - background / deferred: FastAPI BackgroundTasks after the response is sent.
    - external / queue / worker: no in-process run — publish to your queue from here later.
    """
    mode = (get_settings().ANNOTATION_ASSET_PIPELINE_MODE or "inline").strip().lower()
    if mode in ("inline", "immediate"):
        await process_annotation_asset_after_create(asset_id)
    elif mode in ("background", "deferred", "async"):
        background_tasks.add_task(process_annotation_asset_after_create, asset_id)
    elif mode in ("external", "queue", "worker"):
        log.warning(
            "ANNOTATION_ASSET_PIPELINE_MODE=%s: external queue not integrated; "
            "asset %s left in_progress. Publish jobs from "
            "schedule_annotation_asset_pipeline() or a worker.",
            mode,
            asset_id,
        )
    else:
        log.warning(
            "Unknown ANNOTATION_ASSET_PIPELINE_MODE=%r; using inline processing",
            mode,
        )
        await process_annotation_asset_after_create(asset_id)
