import re

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    company_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str = Field(..., min_length=8, max_length=32)
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v: str) -> str:
        if not _E164_RE.match(v):
            raise ValueError("phone must be E.164 format, e.g. +15551234567")
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> "RegisterRequest":
        if self.password != self.confirm_password:
            raise ValueError("confirm_password must match password")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserPublic(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    company_id: str
    role: str
    role_id: str
    slug: str
    is_superuser: bool = False
    two_factor_enabled: bool = False
    two_factor_feature_enabled: bool = True
    permissions: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": False}


class AuthTokensData(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class TwoFactorConfirmSetupRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)
    secret: str = Field(..., min_length=16, max_length=128)


class TwoFactorVerifyLoginRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=20)
    temp_token: str = Field(..., min_length=20)
