from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationQuery(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1, le=100)


class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class APIResponse(BaseModel, Generic[T]):
    statusCode: int = 200
    message: str
    data: T | None
    pagination: PaginationMeta | None = None


class APIErrorBody(BaseModel):
    statusCode: int
    message: str
    data: None = None
    errors: dict[str, Any] | list[Any] | None = None
