# Annotra database schema (ERD)

This document reflects the SQLAlchemy models under `backend/models/`.

## Entity–relationship diagram

```mermaid
erDiagram
    companies ||--o{ users : "company_id CASCADE"
    companies ||--o{ projects : "company_id CASCADE"
    companies ||--o{ roles : "company_id CASCADE nullable"
    roles ||--o{ users : "role_id RESTRICT"
    roles }o--o{ permissions : "role_permissions"
    users ||--o{ refresh_tokens : "user_id CASCADE"
    users ||--o{ media : "user_id SET NULL"
    projects ||--o{ annotation_assets : "project_id CASCADE"
    media ||--o{ annotation_assets : "primary_media_id SET NULL"
    annotation_assets ||--o{ annotations : "asset_id CASCADE"
    annotation_assets }o--o{ media : "annotation_asset_media"
    users ||--o{ audit_logs : "actor_user_id SET NULL"
    companies ||--o{ audit_logs : "company_id SET NULL"
    refresh_tokens ||--o| refresh_tokens : "replaced_by_id SET NULL"

    companies {
        uuid id PK
        timestamptz created_at
        timestamptz deleted_at
        string name
        string slug UK
    }

    users {
        uuid id PK
        timestamptz created_at
        timestamptz deleted_at
        timestamptz updated_at
        string full_name
        string email UK
        string phone
        string password_hash
        uuid company_id FK
        uuid role_id FK
        boolean is_superuser
        boolean two_factor_enabled
        string totp_secret
        text two_factor_recovery_cipher
    }

    roles {
        uuid id PK
        timestamptz created_at
        timestamptz deleted_at
        uuid company_id FK "nullable"
        string name
        int hierarchy_level
        boolean is_system
    }

    permissions {
        uuid id PK
        timestamptz created_at
        timestamptz deleted_at
        string code UK
        text description
    }

    role_permissions {
        uuid role_id PK_FK
        uuid permission_id PK_FK
    }

    projects {
        uuid id PK
        timestamptz created_at
        timestamptz deleted_at
        timestamptz updated_at
        uuid company_id FK
        string name
        text description
        string status
    }

    media {
        uuid id PK
        timestamptz created_at
        timestamptz updated_at
        string storage_key
        string mime_type
        string kind
        int size_bytes
        uuid user_id FK "nullable"
    }

    annotation_assets {
        uuid id PK
        timestamptz created_at
        timestamptz updated_at
        uuid project_id FK
        string file_type
        string title
        string status
        uuid primary_media_id FK "nullable"
        int frame_count
        float duration_seconds
    }

    annotation_asset_media {
        uuid asset_id PK_FK
        uuid media_id PK_FK
        int sort_order
    }

    annotations {
        uuid id PK
        timestamptz created_at
        timestamptz updated_at
        uuid asset_id FK
        string annotation_kind
        jsonb payload
    }

    refresh_tokens {
        uuid id PK
        timestamptz created_at
        uuid user_id FK
        string token_hash
        timestamptz expires_at
        boolean revoked
        uuid replaced_by_id FK "nullable self"
    }

    audit_logs {
        uuid id PK
        timestamptz created_at
        uuid actor_user_id FK "nullable"
        uuid company_id FK "nullable"
        string action
        string resource_type
        string resource_id
        jsonb metadata
    }
```

## Tables (physical names)

| Table | Model | Notes |
| --- | --- | --- |
| `companies` | `Company` | Soft delete; unique `slug`. |
| `users` | `User` | Soft delete; unique `email`; belongs to company and role. |
| `roles` | `Role` | Soft delete; `company_id` nullable (shared vs company-scoped roles). |
| `permissions` | `Permission` | Soft delete; unique `code`. |
| `role_permissions` | association | Composite PK `(role_id, permission_id)`; both CASCADE on delete. |
| `projects` | `Project` | Soft delete; scoped to company. |
| `media` | `Media` | No soft delete; optional owning user. `kind` values align with `MediaKind` enum (`image`, `video`, `audio`, `model_3d`). |
| `annotation_assets` | `AnnotationAsset` | Work item / dataset root; optional `primary_media_id`. |
| `annotation_asset_media` | `AnnotationAssetMedia` | Many-to-many asset ↔ media with `sort_order`. |
| `annotations` | `Annotation` | JSON payload per `annotation_kind`. |
| `refresh_tokens` | `RefreshToken` | Rotation chain via `replaced_by_id`. |
| `audit_logs` | `AuditLog` | `metadata` column mapped as `meta` in ORM. |

## Delete behaviors (FK `ondelete`)

- **CASCADE**: child removed with parent (`users` ← `companies`, `projects` ← `companies`, `roles` ← `companies`, `annotation_assets` ← `projects`, `annotations` ← `annotation_assets`, `annotation_asset_media` rows, `refresh_tokens` ← `users`, `role_permissions` rows).
- **RESTRICT**: cannot delete `roles` while referenced by `users`.
- **SET NULL**: `media.user_id`, `annotation_assets.primary_media_id`, `audit_logs.actor_user_id`, `audit_logs.company_id`, `refresh_tokens.replaced_by_id`.

## Regenerating `erd.jpg`

Mermaid CLI renders to `.svg`, `.png`, or `.pdf` (not JPEG). Save the `erDiagram` source (without markdown fences) to e.g. `erd.mmd`, then from this directory:

```bash
# If Puppeteer fails with a sandbox error on Linux, use a config file containing:
# { "args": ["--no-sandbox", "--disable-setuid-sandbox"] }

npx -y @mermaid-js/mermaid-cli@latest -p puppeteer.json -i erd.mmd -o erd.png -b white -w 2400
convert erd.png -quality 92 erd.jpg && rm erd.png
```

`convert` is ImageMagick; use `magick erd.png -quality 92 erd.jpg` if your install exposes the `magick` command only.
