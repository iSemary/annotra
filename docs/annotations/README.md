# Annotations

**Assets** live under a **project** and have a type: `image`, `video`, `audio`, or `dataset`. They link to **media** (one primary file, or multiple for datasets). **Annotations** are JSON rows (`annotation_kind`, `payload`) on an asset.

**API** — Bearer, base `/api/v1`, tag `annotation-assets`:

- `GET /annotation-assets` — list (pagination, optional filters/sort). Query `project_id` limits to one project; **omit** `project_id` to list assets across all projects in the company (same RBAC per `file_type`).
- `POST /annotation-assets` — create asset.
- `GET|PATCH|DELETE /annotation-assets/{id}` — one asset.
- `GET|POST /annotation-assets/{id}/annotations` — list / create annotations.
- `PATCH|DELETE /annotation-assets/{id}/annotations/{annotation_id}` — update / delete.
- `GET /annotation-assets/{id}/export?format=json|csv|coco` — download.

Routes require **`projects:read`**. Read/write per **asset type** uses `annotations:{type}:read|write`, or legacy **`annotations:read`** / **`annotations:write`** for all types. Superusers skip checks. Media uploads use [Media](../media/README.md) permissions.

**App:** `/dashboard/annotations` (+ `/images`, `/videos`, `/audios`, `/datasets`) shows the **combined** asset table; per-project URLs stay under `/dashboard/projects/{id}/annotations/...`. The dashboard **sidebar** and **top bar** mirror All / Images / … using either global or project-scoped links depending on the current route.

**Postman:** collection in repo includes annotation examples.

**Code:** `backend/core/annotation_permissions.py`, `backend/services/annotation_asset_service.py`, `backend/routes/annotation_assets.py`; `frontend/src/lib/annotation-assets.ts`, `annotation-nav.ts`.
