import asyncio
import logging
from uuid import UUID

from worker.celery_app import app

log = logging.getLogger("annotra.worker")


@app.task(name="annotra.run_annotation_asset_pipeline")
def run_annotation_asset_pipeline(asset_id: str) -> None:
    from core.config import get_settings
    from services.annotation_asset_processing import process_annotation_asset_after_create
    from services.ml_inference.runtime_env import apply_ml_runtime_environment

    apply_ml_runtime_environment(get_settings())

    log.info("celery_task_start", extra={"asset_id": asset_id, "task": "annotation_pipeline"})
    try:
        asyncio.run(process_annotation_asset_after_create(UUID(asset_id)))
    except Exception:
        log.exception("celery_task_failed", extra={"asset_id": asset_id})
        raise
    log.info("celery_task_done", extra={"asset_id": asset_id, "task": "annotation_pipeline"})
