# Video annotations

## Asset type

- **`file_type`:** `video`
- **Media:** one **primary** video (`media.kind` = `video`). Upload media first, then create the asset with `primary_media_id`. Optional **`frame_count`** on create helps describe the asset.

## Annotation kinds

- **`video_frame_bbox`** — `payload`: `frame` (non-negative integer), `label`, `bbox` `{ x, y, w, h }` in video frame coordinates (same convention as images for that frame).
- **`video_track`** — `payload`: `object_id`, `label`, optional fixed `w` / `h`, and `frames`: `[{ frame, x, y }, ...]` for a tracked object over time.

## Permissions

- Read: `annotations:video:read` (or legacy `annotations:read`)
- Write: `annotations:video:write` (or legacy `annotations:write`)

## App routes

- Global: `/dashboard/annotations/videos`
- Project: `/dashboard/projects/{project_id}/annotations/videos`
- Editor: `/dashboard/projects/{project_id}/annotations/{asset_id}/edit`

## Export

- **JSON / CSV / COCO:** COCO encoding maps frame-specific data to synthetic image keys per frame (see server implementation).

## API

- `POST /api/v1/annotation-assets` with `file_type: "video"` and `primary_media_id`.
- Create annotations with `video_frame_bbox` or `video_track` as in Postman **Annotation assets (video)**.
