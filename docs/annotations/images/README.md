# Image annotations

## Asset type

- **`file_type`:** `image`
- **Media:** one **primary** image file (`media.kind` = `image`). Upload via **Media** (`POST /api/v1/media` or the dashboard file manager) with `media:write`, then pass `primary_media_id` when creating the asset.

## Annotation kind

- **`image_bbox`** — `payload`: `label` (string), `bbox`: `{ x, y, w, h }` (pixel coordinates on the image). Optional `id` (client id).

## Permissions

- Read: `annotations:image:read` (or legacy `annotations:read`)
- Write: `annotations:image:write` (or legacy `annotations:write`)

## App routes

- Global hub: `/dashboard/annotations/images`
- Project: `/dashboard/projects/{project_id}/annotations/images`
- Full editor: `/dashboard/projects/{project_id}/annotations/{asset_id}/edit`

## Export

- **JSON / CSV:** all annotations.
- **COCO:** supported for single-image assets (bbox-style).

## API quick reference

- `POST /api/v1/annotation-assets` with `file_type: "image"` and `primary_media_id`.
- `POST /api/v1/annotation-assets/{id}/annotations` with `annotation_kind: "image_bbox"` and payload above.

See also the main [Annotations README](../README.md) and Postman **Annotation assets (image)**.
