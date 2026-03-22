from typing import Any


class AppException(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        errors: dict[str, Any] | list[Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.errors = errors
        super().__init__(message)
