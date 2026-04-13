from celery import Celery

from core.config import get_settings

_settings = get_settings()

app = Celery(
    "annotra",
    broker=_settings.celery_broker_url_resolved,
    backend=_settings.celery_result_backend_resolved,
)
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

import worker.tasks  # noqa: E402, F401 — register tasks
