import re

from pydantic import BaseModel, EmailStr, Field, field_validator

_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


class UserCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str = Field(..., min_length=8, max_length=32)
    password: str = Field(..., min_length=8, max_length=128)
    role_id: str = Field(..., min_length=1)

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v: str) -> str:
        if not _E164_RE.match(v):
            raise ValueError("phone must be E.164 format, e.g. +15551234567")
        return v


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, min_length=8, max_length=32)

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not _E164_RE.match(v):
            raise ValueError("phone must be E.164 format, e.g. +15551234567")
        return v


class UserRolePatchRequest(BaseModel):
    role_id: str = Field(..., min_length=1)


class UserListItem(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    role_id: str
    role_name: str
    created_at: str
    updated_at: str
