"""Apply process env so ML loads from disk only (no Hugging Face Hub network)."""

from __future__ import annotations

import logging
import os

from core.config import Settings

log = logging.getLogger("annotra.ml.runtime_env")


def apply_ml_runtime_environment(settings: Settings) -> None:
    """
    When ML_OFFLINE is true, block Hub HTTP: models must live under TRANSFORMERS_CACHE
    or paths set in SAM2_MODEL_ID / WHISPER_MODEL_ID (local directories).

    Call before any transformers / faster_whisper model load (API pipeline + Celery worker).
    """
    if settings.ML_OFFLINE:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["HF_DATASETS_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        log.info("ml_runtime_offline_enabled", extra={"mode": "local_files_only"})
    if settings.HF_TOKEN and not settings.ML_OFFLINE:
        os.environ.setdefault("HF_TOKEN", settings.HF_TOKEN)


def transformers_token(settings: Settings) -> str | None:
    """Do not pass a token when offline (no Hub calls)."""
    if settings.ML_OFFLINE:
        return None
    return (settings.HF_TOKEN or "").strip() or None


def transformers_local_kw(settings: Settings) -> dict:
    """kwargs for from_pretrained / pipeline model_kwargs."""
    if settings.ML_OFFLINE:
        return {"local_files_only": True}
    return {}


def ml_annotation_source(settings: Settings) -> str:
    return "ml_local" if settings.ML_OFFLINE else "hf_auto"
