# 3D model annotations

## Asset type

- **`file_type`:** `model_3d` (matches `media.kind` **`model_3d`** on the primary file).
- **Media:** upload a 3D file (glTF, GLB, OBJ, STL, etc.—see `backend/models/media_kind.py` and `MEDIA_ALLOWED_EXTENSIONS`). The dashboard picker mirrors the same rules. Create the asset with **`primary_media_id`** pointing at that media row.

## Annotation kinds (world space)

Coordinates are in the **same world space** as the loaded scene (ray hits on the mesh).

- **`model_3d_point`** — `label`, `position`: `{ x, y, z }`, optional `id`.
- **`model_3d_oriented_box`** — `label`, `center`: `{ x, y, z }`, `half_extents`: `{ x, y, z }` (each **positive**), `rotation`: unit **quaternion** `{ x, y, z, w }` (identity `0,0,0,1`), optional `id`.

## In-browser viewer (app)

The embedded **Three.js** viewer loads **GLB** and **glTF** only. Other formats remain valid in storage and downloads; the UI explains that interactive preview needs glTF/GLB.

## Permissions

- Read: `annotations:model_3d:read` (or legacy `annotations:read`)
- Write: `annotations:model_3d:write` (or legacy `annotations:write`)

## App routes

- Global: `/dashboard/annotations/model-3d`
- Project: `/dashboard/projects/{project_id}/annotations/model-3d`
- Editor: `/dashboard/projects/{project_id}/annotations/{asset_id}/edit`

## Export

- **JSON / CSV:** full asset + annotations.
- **COCO:** not supported for `model_3d` assets.

## API

- `POST /api/v1/annotation-assets` with `file_type: "model_3d"` and `primary_media_id` (media must be `model_3d`).
- `POST .../annotations` with `model_3d_point` or `model_3d_oriented_box`.

Postman: **Annotation assets (3D model)**.
