# Media

Binary files are stored locally or on S3; metadata lives in the `media` table (`storage_key`, `mime_type`, `size_bytes`, optional `user_id`, timestamps). Keys look like `{user_id}/{year}/{month}/{uuid}.{ext}`.

**API** (Bearer token): `GET /api/v1/media` (paginated `items` for the current user; query `page`, `per_page` ≤ 200, optional `kind`), `POST /api/v1/media/upload` (field `file`), `POST /api/v1/media/upload/bulk` (field `files`, max 10), `GET` / `DELETE /api/v1/media/{id}`. Responses use the usual envelope; body fields are snake_case and include `url`.

**Dashboard:** `GET /api/v1/dashboard/media` — `kind` filter: `all` | `image` | `video` | `audio` | `model_3d`. Superuser only.

**Kinds:** `image`, `video`, `audio`, `model_3d` (see `MediaKind` in code). MIME allowlist plus extension rules; generic types like `application/octet-stream` need a known filename extension. Default size caps: photo 10MB, video 50MB, audio 50MB, 3D 200MB (`MEDIA_MAX_*`).

**Local:** `MEDIA_STORAGE=local` (default). Files under `MEDIA_LOCAL_PATH`; served at `/storage/...`. URLs from `MEDIA_LOCAL_BASE_URL`, or `APP_URL` + `/storage`, or `http://127.0.0.1:{API_PORT}/storage`.

**S3:** `MEDIA_STORAGE=aws` — set `AWS_S3_BUCKET` (+ optional `AWS_S3_ENDPOINT`, keys, `AWS_REGION`). Presigned GET URLs when using a custom endpoint. Needs `boto3`.

**Env (common):** `MEDIA_*` (storage path/URL, `MEDIA_ALLOWED_EXTENSIONS`, `MEDIA_MAX_PHOTO_SIZE`, `MEDIA_MAX_VIDEO_SIZE`, `MEDIA_MAX_AUDIO_SIZE`, `MEDIA_MAX_MODEL_SIZE`) and `AWS_*` when using S3.
