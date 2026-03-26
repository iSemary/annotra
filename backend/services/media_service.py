import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import Settings, get_settings
from core.exceptions import AppException
from models.media import Media
from models.media_kind import (
    AUDIO_FILE_EXTENSIONS,
    GENERIC_MIMES_FOR_EXTENSION_MATCH,
    MIME_TO_EXTENSION,
    MIME_TO_KIND,
    MODEL_FILE_EXTENSIONS,
    MediaKind,
)
from services.media_storage.factory import create_media_storage

if TYPE_CHECKING:
    from services.media_storage.local import LocalMediaStorage
    from services.media_storage.s3 import S3MediaStorage

_storage_singleton: "LocalMediaStorage | S3MediaStorage | None" = None


def get_media_storage() -> "LocalMediaStorage | S3MediaStorage":
    global _storage_singleton
    if _storage_singleton is None:
        _storage_singleton = create_media_storage(get_settings())
    return _storage_singleton


def media_to_dict(m: Media, url: str) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "kind": m.kind,
        "storage_key": m.storage_key,
        "mime_type": m.mime_type,
        "size_bytes": m.size_bytes,
        "user_id": str(m.user_id) if m.user_id else None,
        "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat(),
        "url": url,
    }


class MediaService:
    def __init__(
        self,
        session: AsyncSession,
        storage: "LocalMediaStorage | S3MediaStorage | None" = None,
        settings: Settings | None = None,
    ) -> None:
        self._session = session
        self._storage = storage or get_media_storage()
        self._settings = settings or get_settings()

    def _allowed_extensions(self) -> list[str]:
        return self._settings.media_allowed_extensions_list

    @staticmethod
    def _extension_from_filename(filename: str | None) -> str | None:
        if not filename or not filename.strip():
            return None
        parts = filename.strip().split(".")
        if len(parts) < 2:
            return None
        return parts[-1].lower()

    @staticmethod
    def _accepted_extensions_for_mime(mime_type: str) -> list[str]:
        ext = MIME_TO_EXTENSION.get(mime_type)
        if not ext:
            return []
        if mime_type == "image/jpeg":
            return ["jpg", "jpeg"]
        if mime_type == "image/tiff":
            return ["tiff", "tif"]
        return [ext]

    def _classify_upload(
        self, mime_type: str, original_filename: str | None
    ) -> tuple[MediaKind, list[str], str]:
        """Return kind, accepted extensions for validation, and extension for storage key."""
        mime = (mime_type or "").strip().lower()
        allowed = self._allowed_extensions()
        ext_from = self._extension_from_filename(original_filename)

        if mime in MIME_TO_EXTENSION:
            kind = MIME_TO_KIND[mime]
            accepted = self._accepted_extensions_for_mime(mime)
            storage_ext = MIME_TO_EXTENSION[mime]
            return kind, accepted, storage_ext

        if mime == "application/zip" and ext_from and ext_from.lower() == "usdz":
            ext = "usdz"
            if ext not in allowed or ext not in MODEL_FILE_EXTENSIONS:
                raise AppException(
                    400,
                    f'File extension ".{ext}" is not allowed. '
                    f"Allowed extensions: {', '.join(allowed)}.",
                )
            return MediaKind.MODEL_3D, [ext], ext

        if mime in GENERIC_MIMES_FOR_EXTENSION_MATCH:
            if not ext_from:
                raise AppException(
                    400,
                    "A filename with a known extension is required for this MIME type "
                    f"({mime}).",
                )
            ext = ext_from.lower()
            if ext not in allowed:
                raise AppException(
                    400,
                    f'File extension ".{ext}" is not allowed. '
                    f"Allowed extensions: {', '.join(allowed)}. "
                    "Configure MEDIA_ALLOWED_EXTENSIONS in .env to change this.",
                )
            if ext in AUDIO_FILE_EXTENSIONS:
                return MediaKind.AUDIO, [ext], ext
            if ext in MODEL_FILE_EXTENSIONS:
                return MediaKind.MODEL_3D, [ext], ext
            raise AppException(
                400,
                "Unsupported file type for this MIME. Use a known audio or 3D extension, "
                f"or a specific Content-Type. Allowed extensions include: {', '.join(allowed)}.",
            )

        raise AppException(
            400,
            "Unsupported file type. Allowed extensions: "
            f"{', '.join(allowed)}. "
            "Supported kinds: image, video, audio, and 3D model formats.",
        )

    def _validate_extension_matches(
        self,
        ext_from_name: str | None,
        accepted: list[str],
        mime_type: str,
    ) -> None:
        ext_to_check = ext_from_name or accepted[0]
        allowed = self._allowed_extensions()
        if ext_to_check not in allowed:
            raise AppException(
                400,
                f'File extension ".{ext_to_check}" is not allowed. '
                f"Allowed extensions: {', '.join(allowed)}. "
                "Configure MEDIA_ALLOWED_EXTENSIONS in .env to change this.",
            )
        if ext_from_name and ext_from_name.lower() not in accepted:
            raise AppException(
                400,
                f'File extension ".{ext_from_name}" does not match the file content '
                f"({mime_type}). Use the correct extension for the file type.",
            )

    def _validate_file_size(self, kind: MediaKind, size_bytes: int) -> None:
        def fmt_mb(b: int) -> str:
            return f"{b / (1024 * 1024):.1f}"

        caps = {
            MediaKind.IMAGE: (
                self._settings.media_max_photo_bytes,
                "Photo",
                "MEDIA_MAX_PHOTO_SIZE",
            ),
            MediaKind.VIDEO: (
                self._settings.media_max_video_bytes,
                "Video",
                "MEDIA_MAX_VIDEO_SIZE",
            ),
            MediaKind.AUDIO: (
                self._settings.media_max_audio_bytes,
                "Audio",
                "MEDIA_MAX_AUDIO_SIZE",
            ),
            MediaKind.MODEL_3D: (
                self._settings.media_max_model_bytes,
                "3D model",
                "MEDIA_MAX_MODEL_SIZE",
            ),
        }
        cap, label, env_name = caps[kind]
        if size_bytes > cap:
            raise AppException(
                400,
                f"{label} size must not exceed {fmt_mb(cap)} MB. "
                f"Current size: {fmt_mb(size_bytes)} MB. "
                f"Configure {env_name} in .env to change the limit.",
            )

    def _generate_storage_key(self, user_id: UUID, file_ext: str) -> str:
        now = datetime.now(UTC)
        y = now.year
        m = f"{now.month:02d}"
        uid = uuid.uuid4()
        ext = file_ext.lstrip(".").lower() or "bin"
        return f"{user_id}/{y}/{m}/{uid}.{ext}"

    async def get_url_for_key(self, key: str) -> str:
        return await self._storage.get_url(key)

    async def upload(
        self,
        body: bytes,
        mime_type: str,
        user_id: UUID,
        original_filename: str | None = None,
    ) -> Media:
        max_raw = self._settings.media_max_file_bytes
        if len(body) > max_raw:
            raise AppException(400, "File is too large.")
        kind, accepted, storage_ext = self._classify_upload(
            mime_type, original_filename
        )
        ext_from = self._extension_from_filename(original_filename)
        self._validate_extension_matches(ext_from, accepted, mime_type)
        size_bytes = len(body)
        self._validate_file_size(kind, size_bytes)
        key = self._generate_storage_key(user_id, storage_ext)
        await self._storage.upload(body, key, mime_type)
        media = Media(
            storage_key=key,
            mime_type=mime_type,
            kind=kind.value,
            size_bytes=size_bytes,
            user_id=user_id,
        )
        self._session.add(media)
        await self._session.flush()
        await self._session.refresh(media)
        return media

    async def upload_bulk(
        self,
        files: list[tuple[bytes, str, str | None]],
        user_id: UUID,
    ) -> list[Media]:
        out: list[Media] = []
        for body, mime_type, name in files:
            out.append(await self.upload(body, mime_type, user_id, name))
        return out

    async def find_by_id(self, media_id: UUID, current_user_id: UUID) -> Media:
        result = await self._session.execute(select(Media).where(Media.id == media_id))
        media = result.scalar_one_or_none()
        if media is None:
            raise AppException(404, "Media not found")
        if media.user_id is not None and media.user_id != current_user_id:
            raise AppException(404, "Media not found")
        return media

    async def delete(self, media_id: UUID, current_user_id: UUID) -> None:
        media = await self.find_by_id(media_id, current_user_id)
        if media.user_id is None:
            raise AppException(404, "Media not found")
        await self._storage.delete(media.storage_key)
        await self._session.delete(media)
        await self._session.flush()

    async def list_dashboard(
        self,
        *,
        page: int,
        per_page: int,
        query: str | None,
        user_id: UUID | None,
        kind: str,
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        from utils.pagination import pagination_meta

        page = max(1, page)
        per_page = min(max(1, per_page), 100)
        conditions: list = []

        if user_id is not None:
            conditions.append(Media.user_id == user_id)
        if kind == MediaKind.IMAGE.value:
            conditions.append(Media.kind == MediaKind.IMAGE.value)
        elif kind == MediaKind.VIDEO.value:
            conditions.append(Media.kind == MediaKind.VIDEO.value)
        elif kind == MediaKind.AUDIO.value:
            conditions.append(Media.kind == MediaKind.AUDIO.value)
        elif kind == MediaKind.MODEL_3D.value:
            conditions.append(Media.kind == MediaKind.MODEL_3D.value)

        search = query.strip() if query and query.strip() else None
        if search:
            like = f"%{search}%"
            conditions.append(
                or_(
                    cast(Media.id, String).ilike(like),
                    Media.storage_key.ilike(like),
                    Media.mime_type.ilike(like),
                    cast(Media.user_id, String).ilike(like),
                    Media.kind.ilike(like),
                )
            )

        base = select(Media).where(*conditions) if conditions else select(Media)
        count_stmt = select(func.count()).select_from(base.subquery())
        total = int((await self._session.execute(count_stmt)).scalar_one())
        offset = (page - 1) * per_page
        list_stmt = (
            base.order_by(Media.created_at.desc()).offset(offset).limit(per_page)
        )
        result = await self._session.execute(list_stmt)
        rows = list(result.scalars().all())

        items: list[dict[str, Any]] = []
        for m in rows:
            url = await self.get_url_for_key(m.storage_key)
            items.append(
                {
                    "id": str(m.id),
                    "kind": m.kind,
                    "storage_key": m.storage_key,
                    "mime_type": m.mime_type,
                    "size_bytes": m.size_bytes,
                    "user_id": str(m.user_id) if m.user_id else None,
                    "created_at": m.created_at.isoformat(),
                    "url": url,
                }
            )

        return items, pagination_meta(page=page, page_size=per_page, total=total)
