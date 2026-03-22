from typing import Literal

from pydantic import BaseModel, Field


ProjectStatusLiteral = Literal["active", "archived"]


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: ProjectStatusLiteral = "active"


class ProjectUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: ProjectStatusLiteral
