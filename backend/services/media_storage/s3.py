import asyncio

from core.config import Settings


class S3MediaStorage:
    def __init__(self, settings: Settings) -> None:
        import boto3

        self._bucket = settings.AWS_S3_BUCKET.strip()
        self._region = settings.AWS_REGION.strip() or "us-east-1"
        endpoint = (settings.AWS_S3_ENDPOINT or "").strip() or None
        self._endpoint = endpoint
        kwargs: dict = {"region_name": self._region}
        if endpoint:
            kwargs["endpoint_url"] = endpoint
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        self._client = boto3.client("s3", **kwargs)
        self._public_base_url: str | None = None
        if not endpoint:
            self._public_base_url = (
                f"https://{self._bucket}.s3.{self._region}.amazonaws.com"
            )

    def _upload_sync(self, body: bytes, key: str, mime_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=body,
            ContentType=mime_type,
            ContentLength=len(body),
        )

    def _delete_sync(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def _get_object_bytes_sync(self, key: str) -> bytes:
        obj = self._client.get_object(Bucket=self._bucket, Key=key)
        return obj["Body"].read()

    def _presigned_get_sync(self, key: str) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=7 * 24 * 3600,
        )

    async def upload(self, body: bytes, key: str, mime_type: str) -> None:
        await asyncio.to_thread(self._upload_sync, body, key, mime_type)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._delete_sync, key)

    async def read_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(self._get_object_bytes_sync, key)

    async def get_url(self, key: str) -> str:
        if self._public_base_url:
            return f"{self._public_base_url}/{key}"
        return await asyncio.to_thread(self._presigned_get_sync, key)
