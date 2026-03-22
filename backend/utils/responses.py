from typing import Any

from fastapi.responses import JSONResponse


def success_json(
    *,
    message: str,
    data: Any,
    status_code: int = 200,
    pagination: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "statusCode": status_code,
        "message": message,
        "data": data,
        "pagination": pagination,
    }
    return JSONResponse(status_code=status_code, content=body)


def error_json(
    *,
    message: str,
    status_code: int = 400,
    errors: dict[str, Any] | list[Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "statusCode": status_code,
        "message": message,
        "data": None,
    }
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(status_code=status_code, content=body)
