from core.config import Settings
from services.media_storage.local import LocalMediaStorage
from services.media_storage.s3 import S3MediaStorage


def create_media_storage(settings: Settings) -> LocalMediaStorage | S3MediaStorage:
    if settings.MEDIA_STORAGE.lower() == "aws":
        if not settings.AWS_S3_BUCKET.strip():
            raise ValueError("AWS_S3_BUCKET is required when MEDIA_STORAGE=aws")
        return S3MediaStorage(settings)
    return LocalMediaStorage(settings)
