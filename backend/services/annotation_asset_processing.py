"""Post-create pipeline for annotation assets (in-process or Celery queue)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import BackgroundTasks

from core.config import get_settings
from db.session import async_session_maker
from models.annotation_asset import AnnotationAsset
from services.media_storage.factory import create_media_storage
from services.ml_inference.runtime_env import apply_ml_runtime_environment

log = logging.getLogger("annotra.annotation_asset")


async def _mark_failed(asset_id: UUID) -> None:
    try:
        async with async_session_maker() as session:
            asset = await session.get(AnnotationAsset, asset_id)
            if asset is not None and asset.status == "in_progress":
                asset.status = "failed"
                asset.updated_at = datetime.now(UTC)
                await session.commit()
    except Exception:
        log.exception("could not mark annotation asset failed id=%s", asset_id)


def _enqueue_celery(asset_id: UUID) -> None:
    from worker.celery_app import app as celery_app

    celery_app.send_task(
        "annotra.run_annotation_asset_pipeline",
        args=[str(asset_id)],
    )
    log.info(
        "annotation_pipeline_enqueued",
        extra={"asset_id": str(asset_id), "task": "annotra.run_annotation_asset_pipeline"},
    )


async def process_annotation_asset_after_create(asset_id: UUID) -> None:
    """Run ML inference; moves asset from in_progress → completed or failed."""
    settings = get_settings()
    apply_ml_runtime_environment(settings)

    try:
        async with async_session_maker() as session:
            from services.ml_inference.orchestrator import load_asset_for_pipeline, run_ml_for_asset

            asset = await load_asset_for_pipeline(session, asset_id)
            if asset is None or asset.status != "in_progress":
                log.info(
                    "pipeline_skip",
                    extra={"asset_id": str(asset_id), "reason": "missing_or_not_in_progress"},
                )
                return

            log.info(
                "pipeline_start",
                extra={"asset_id": str(asset_id), "file_type": asset.file_type},
            )
            storage = create_media_storage(settings)
            await run_ml_for_asset(session, asset, storage, settings)
            await session.commit()
            log.info("pipeline_complete", extra={"asset_id": str(asset_id)})
    except Exception:
        log.exception("annotation asset pipeline failed id=%s", asset_id)
        await _mark_failed(asset_id)


async def schedule_annotation_asset_pipeline(
    asset_id: UUID,
    *,
    background_tasks: BackgroundTasks,
) -> None:
    """
    Dispatch post-create processing based on ANNOTATION_ASSET_PIPELINE_MODE.

    - inline / immediate: await in the current request (default).
    - background / deferred: FastAPI BackgroundTasks after the response is sent.
    - external / queue / worker: Celery task (requires Redis broker).
    """
    mode = (get_settings().ANNOTATION_ASSET_PIPELINE_MODE or "inline").strip().lower()
    if mode in ("inline", "immediate"):
        await process_annotation_asset_after_create(asset_id)
    elif mode in ("background", "deferred", "async"):
        background_tasks.add_task(process_annotation_asset_after_create, asset_id)
    elif mode in ("external", "queue", "worker"):
        try:
            _enqueue_celery(asset_id)
        except Exception:
            log.exception(
                "annotation_pipeline_enqueue_failed",
                extra={"asset_id": str(asset_id)},
            )
            await _mark_failed(asset_id)
    else:
        log.warning(
            "Unknown ANNOTATION_ASSET_PIPELINE_MODE=%r; using inline processing",
            mode,
        )
        await process_annotation_asset_after_create(asset_id)
