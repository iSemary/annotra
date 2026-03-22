from pydantic import BaseModel, Field


class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    hierarchy_level: int = Field(..., ge=0, le=1000)
    permission_ids: list[str] = Field(default_factory=list)


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    hierarchy_level: int | None = Field(None, ge=0, le=1000)
    permission_ids: list[str] | None = None


class RoleOut(BaseModel):
    id: str
    name: str
    hierarchy_level: int
    is_system: bool
    company_id: str | None
    permission_codes: list[str]
