import asyncio
import os

from core.config import Settings


class LocalMediaStorage:
    def __init__(self, settings: Settings) -> None:
        self._base_path = settings.media_local_path_resolved
        self._base_url = settings.media_local_public_base_url

    def _upload_sync(self, body: bytes, key: str) -> None:
        full_path = self._base_path / key
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(body)

    def _delete_sync(self, key: str) -> None:
        full_path = self._base_path / key
        if full_path.is_file():
            full_path.unlink()

    async def upload(self, body: bytes, key: str, _mime_type: str) -> None:
        await asyncio.to_thread(self._upload_sync, body, key)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._delete_sync, key)

    async def get_url(self, key: str) -> str:
        return f"{self._base_url}/{key.replace(os.sep, '/')}"
