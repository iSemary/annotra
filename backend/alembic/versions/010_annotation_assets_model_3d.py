"""annotation_assets file_type model_3d + RBAC permissions

Revision ID: 010_model_3d_ann
Revises: 009_asset_status_failed
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_model_3d_ann"
down_revision: Union[str, None] = "009_asset_status_failed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PID_READ = "a0000001-0000-4000-8000-000000000015"
PID_WRITE = "a0000001-0000-4000-8000-000000000016"

RID = {
    "OWNER": "b0000001-0000-4000-8000-000000000001",
    "ADMIN": "b0000001-0000-4000-8000-000000000002",
    "ANNOTATOR": "b0000001-0000-4000-8000-000000000003",
    "VIEWER": "b0000001-0000-4000-8000-000000000004",
}


def upgrade() -> None:
    op.drop_constraint("ck_annotation_assets_file_type", "annotation_assets", type_="check")
    op.create_check_constraint(
        "ck_annotation_assets_file_type",
        "annotation_assets",
        "file_type IN ('image','video','audio','dataset','model_3d')",
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, code, description, created_at, deleted_at) "
            "VALUES (CAST(:id AS uuid), :code, :desc, now(), NULL)"
        ),
        {
            "id": PID_READ,
            "code": "annotations:model_3d:read",
            "desc": "View 3D model annotation assets",
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, code, description, created_at, deleted_at) "
            "VALUES (CAST(:id AS uuid), :code, :desc, now(), NULL)"
        ),
        {
            "id": PID_WRITE,
            "code": "annotations:model_3d:write",
            "desc": "Create and edit 3D model annotation assets",
        },
    )

    def link(role: str, perm_id: str) -> None:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "VALUES (CAST(:rid AS uuid), CAST(:pid AS uuid))"
            ),
            {"rid": RID[role], "pid": perm_id},
        )

    for r in ("VIEWER", "ANNOTATOR", "ADMIN", "OWNER"):
        link(r, PID_READ)
    for r in ("ANNOTATOR", "ADMIN", "OWNER"):
        link(r, PID_WRITE)


def downgrade() -> None:
    conn = op.get_bind()
    for pid in (PID_READ, PID_WRITE):
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = CAST(:pid AS uuid)"),
            {"pid": pid},
        )
        conn.execute(
            sa.text("DELETE FROM permissions WHERE id = CAST(:pid AS uuid)"),
            {"pid": pid},
        )

    op.drop_constraint("ck_annotation_assets_file_type", "annotation_assets", type_="check")
    op.create_check_constraint(
        "ck_annotation_assets_file_type",
        "annotation_assets",
        "file_type IN ('image','video','audio','dataset')",
    )
