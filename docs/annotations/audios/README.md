# Audio annotations

## Asset type

- **`file_type`:** `audio`
- **Media:** one **primary** audio file (`media.kind` = `audio`). Create the asset with `primary_media_id`. Optional **`duration_seconds`** on create is metadata only.

## Annotation kind

- **`audio_segment`** — `payload`: `start`, `end` (seconds, `end` > `start`), `label`. Optional `id`.

## Permissions

- Read: `annotations:audio:read` (or legacy `annotations:read`)
- Write: `annotations:audio:write` (or legacy `annotations:write`)

## App routes

- Global: `/dashboard/annotations/audios`
- Project: `/dashboard/projects/{project_id}/annotations/audios`
- Editor: `/dashboard/projects/{project_id}/annotations/{asset_id}/edit`

## Export

- **JSON / CSV / COCO:** COCO export uses a synthetic layout where bbox encodes time (see `annotation_asset_service` COCO builder for audio).

## API

- `POST /api/v1/annotation-assets` with `file_type: "audio"` and `primary_media_id`.
- `POST .../annotations` with `annotation_kind: "audio_segment"`.

Postman: **Annotation assets (audio)**.
