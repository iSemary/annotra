# Projects

A **project** groups work in Annotra: it belongs to your company, has a name, description, and status (for example active or archived). Annotation assets are always tied to a **project** via `project_id`.

## In the app

- **List / manage:** `/dashboard/projects` and `/dashboard/projects/{id}`.
- **Annotations for one project:** `/dashboard/projects/{id}/annotations` lists all asset types for that project. Use the sidebar (All, Images, Videos, Audios, Datasets, **3D models**) or the sub-routes under `.../annotations/images`, `.../annotations/model-3d`, etc.

## API

- `GET|POST /api/v1/projects` — list (with pagination) and create (requires `projects:write` where applicable).
- `GET|PATCH|DELETE /api/v1/projects/{id}` — read, update, delete.

Creating an annotation asset always requires a valid `project_id` your user can access. Listing annotation assets with an optional `project_id` query scopes results to that project; omitting it lists assets across allowed projects (see [Annotations](../annotations/README.md)).

## Related docs

- [Annotations hub](../annotations/README.md) — asset types, permissions, export.
- Postman: **Projects** folder in [`postman/collection.json`](../../postman/collection.json).
