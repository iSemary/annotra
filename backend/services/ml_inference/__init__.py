"""Hugging Face / local ML inference for annotation assets (run inside Celery worker)."""

from services.ml_inference.orchestrator import run_ml_for_asset

__all__ = ["run_ml_for_asset"]
