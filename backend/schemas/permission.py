from pydantic import BaseModel, Field


class PermissionCreateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(None, max_length=2000)


class PermissionUpdateRequest(BaseModel):
    description: str | None = Field(None, max_length=2000)


class PermissionOut(BaseModel):
    id: str
    code: str
    description: str | None
