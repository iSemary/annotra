# Annotations

**Assets** live under a **project** and have a type: `image`, `video`, `audio`, `dataset`, or **`model_3d`**. They link to **media** (one primary file, or multiple for datasets). **Annotations** are JSON rows (`annotation_kind`, `payload`) on an asset.

**API** — Bearer, base `/api/v1`, tag `annotation-assets`:

- `GET /annotation-assets` — list (pagination, optional filters/sort). Query `project_id` limits to one project; **omit** `project_id` to list assets across all projects in the company (same RBAC per `file_type`).
- `POST /annotation-assets` — create asset (new rows start **`in_progress`**, then a post-create pipeline sets **`completed`** or **`failed`**).

**Pipeline (`ANNOTATION_ASSET_PIPELINE_MODE` in [`backend/.env.example`](../../backend/.env.example))** — `inline` / `immediate`: run ML inference in the same request (response reflects final `completed` / `failed`). `background` / `deferred` / `async`: run after the response via FastAPI **BackgroundTasks** (UI may poll while `in_progress`). `external` / `queue` / `worker`: enqueue a **Celery** task (`annotra.run_annotation_asset_pipeline`); requires **Redis** (`REDIS_URL` / `CELERY_BROKER_URL`) and a worker process: from `backend/`, `celery -A worker.celery_app worker -l info`. Install worker ML libraries with `pip install -r requirements.txt -r requirements-ml.txt`. Use `ML_PIPELINE_DRY_RUN=true` for placeholder annotations without loading large models.

**Air-gapped / no Hub HTTP** — set `ML_OFFLINE=true`. The process sets `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE`, and loads SAM2/Whisper with `local_files_only` (Transformers) so weights must exist on disk (snapshot directories pointed to by `SAM2_MODEL_ID` / `WHISPER_MODEL_ID`, or a pre-populated Hugging Face cache). `HF_TOKEN` is not used when `ML_OFFLINE=true`. For audio without Transformers Whisper weights, set `WHISPER_ENGINE=faster_whisper` and `WHISPER_MODEL_ID` to a local **CTranslate2** model directory (`pip install faster-whisper`).

**Models (worker)** — images / dataset images / video: **SAM 2** via Transformers (`SAM2_MODEL_ID`). Audio: Transformers Whisper (`WHISPER_ENGINE=transformers`) or **faster-whisper** (`WHISPER_ENGINE=faster_whisper`). 3D meshes: **geometric instance clustering** (surface sample + DBSCAN + PCA oriented boxes), not the full ScanNet Mask3D training stack.

- `GET|PATCH|DELETE /annotation-assets/{id}` — one asset.
- `POST /annotation-assets/{id}/re-annotate` — deletes **all** annotations, sets `in_progress`, and schedules the same ML pipeline again (same modes as create). **Destructive** to manual labels.
- `GET|POST /annotation-assets/{id}/annotations` — list / create annotations.
- `PATCH|DELETE /annotation-assets/{id}/annotations/{annotation_id}` — update / delete.
- `GET /annotation-assets/{id}/export?format=json|csv|coco` — download.

Routes require **`projects:read`**. Read/write per **asset type** uses `annotations:{type}:read|write`, or legacy **`annotations:read`** / **`annotations:write`** for all types. Superusers skip checks. Media uploads use [Media](../media/README.md) permissions.

**App:** `/dashboard/annotations` (+ `/images`, `/videos`, `/audios`, `/datasets`, **`/model-3d`**) shows the **combined** asset table; per-project URLs stay under `/dashboard/projects/{id}/annotations/...`. The dashboard **sidebar** and **top bar** mirror All / Images / … / **3D models** using either global or project-scoped links depending on the current route.

**Postman:** collection in repo includes annotation examples.

**Code:** `backend/core/annotation_permissions.py`, `backend/core/config.py` (`ANNOTATION_ASSET_PIPELINE_MODE`), `backend/services/annotation_asset_service.py`, `backend/services/annotation_asset_processing.py`, `backend/routes/annotation_assets.py`; `frontend/src/lib/annotation-assets.ts`, `annotation-nav.ts`.
