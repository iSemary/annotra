import re
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent

_DEFAULT_MEDIA_EXTENSIONS = (
    "jpg,jpeg,png,gif,webp,heic,heif,bmp,tiff,tif,mp4,mov,webm,m4v,3gp,"
    "mp3,wav,flac,ogg,m4a,aac,opus,aif,aiff,caf,"
    "obj,mtl,stl,ply,fbx,dae,gltf,glb,blend,3ds,usdz,x3d,wrl,abc,step,stp"
)
_DEFAULT_MAX_PHOTO = 10 * 1024 * 1024
_DEFAULT_MAX_VIDEO = 50 * 1024 * 1024
_DEFAULT_MAX_AUDIO = 50 * 1024 * 1024
_DEFAULT_MAX_MODEL = 200 * 1024 * 1024


def parse_media_allowed_extensions(env_value: str) -> list[str]:
    if not env_value.strip():
        return [e.strip().lower() for e in _DEFAULT_MEDIA_EXTENSIONS.split(",") if e.strip()]
    return [e.strip().lower() for e in env_value.split(",") if e.strip()]


def parse_size_bytes(env_value: str | None, default_bytes: int) -> int:
    if not env_value or not env_value.strip():
        return default_bytes
    s = env_value.strip().upper()
    match = re.match(r"^(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)?$", s)
    if not match:
        return default_bytes
    num = float(match.group(1))
    unit = (match.group(2) or "B").upper()
    mult = {"B": 1, "KB": 1024, "MB": 1024**2, "GB": 1024**3}.get(unit, 1)
    out = int(num * mult)
    return out if out > 0 else default_bytes


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://annotra:annotra@localhost:5432/annotra"
    JWT_SECRET: str = "dev-secret-change-in-production-min-32-chars!!"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    COOKIE_SECURE: bool = False

    DEFAULT_ADMIN_EMAIL: str | None = None
    DEFAULT_ADMIN_PASSWORD: str | None = None
    DEFAULT_COMPANY_NAME: str = "Annotra"
    DEFAULT_ADMIN_FULL_NAME: str = "Super Admin"
    DEFAULT_ADMIN_PHONE: str = "+15551234567"

    REFRESH_COOKIE_NAME: str = "refresh_token"
    REFRESH_COOKIE_PATH: str = "/api/v1/auth"

    API_V1_PREFIX: str = "/api/v1"

    API_PORT: int = 8006

    TWO_FACTOR_ENABLED: bool = True

    APP_URL: str | None = None
    MEDIA_STORAGE: str = "local"
    MEDIA_LOCAL_PATH: str = "data/storage"
    MEDIA_LOCAL_BASE_URL: str | None = None
    MEDIA_ALLOWED_EXTENSIONS: str = _DEFAULT_MEDIA_EXTENSIONS
    MEDIA_MAX_PHOTO_SIZE: str = "10MB"
    MEDIA_MAX_VIDEO_SIZE: str = "50MB"
    MEDIA_MAX_AUDIO_SIZE: str = "50MB"
    MEDIA_MAX_MODEL_SIZE: str = "200MB"

    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str = ""
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_S3_ENDPOINT: str | None = None

    @field_validator("JWT_SECRET")
    @classmethod
    def jwt_secret_min_length(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def media_allowed_extensions_list(self) -> list[str]:
        return parse_media_allowed_extensions(self.MEDIA_ALLOWED_EXTENSIONS)

    @property
    def media_max_photo_bytes(self) -> int:
        return parse_size_bytes(self.MEDIA_MAX_PHOTO_SIZE, _DEFAULT_MAX_PHOTO)

    @property
    def media_max_video_bytes(self) -> int:
        return parse_size_bytes(self.MEDIA_MAX_VIDEO_SIZE, _DEFAULT_MAX_VIDEO)

    @property
    def media_max_audio_bytes(self) -> int:
        return parse_size_bytes(self.MEDIA_MAX_AUDIO_SIZE, _DEFAULT_MAX_AUDIO)

    @property
    def media_max_model_bytes(self) -> int:
        return parse_size_bytes(self.MEDIA_MAX_MODEL_SIZE, _DEFAULT_MAX_MODEL)

    @property
    def media_max_file_bytes(self) -> int:
        return max(
            self.media_max_photo_bytes,
            self.media_max_video_bytes,
            self.media_max_audio_bytes,
            self.media_max_model_bytes,
        )

    @property
    def media_local_path_resolved(self) -> Path:
        p = Path(self.MEDIA_LOCAL_PATH)
        return p if p.is_absolute() else (_BACKEND_DIR / p)

    @property
    def media_local_public_base_url(self) -> str:
        if self.MEDIA_LOCAL_BASE_URL and self.MEDIA_LOCAL_BASE_URL.strip():
            return self.MEDIA_LOCAL_BASE_URL.rstrip("/")
        if self.APP_URL and self.APP_URL.strip():
            return f"{self.APP_URL.rstrip('/')}/storage"
        return f"http://127.0.0.1:{self.API_PORT}/storage"


@lru_cache
def get_settings() -> Settings:
    return Settings()
