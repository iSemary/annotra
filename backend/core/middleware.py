import logging
import time
import uuid

from starlette.datastructures import MutableHeaders

logger = logging.getLogger("annotra.request")


class RequestLoggingMiddleware:
    """Pure ASGI middleware so CORS headers still apply when inner handlers fail."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        start = time.perf_counter()
        status_code: int | None = None
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_headers(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(raw=message["headers"])
                headers["x-request-id"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "request_failed request_id=%s method=%s path=%s duration_ms=%.2f",
                request_id,
                scope.get("method", ""),
                scope.get("path", ""),
                duration_ms,
            )
            raise

        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "request request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
            request_id,
            scope.get("method", ""),
            scope.get("path", ""),
            status_code,
            duration_ms,
        )
