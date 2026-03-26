"""media and per-modality annotation permissions

Revision ID: 007_annotation_perms
Revises: 006_annotation_assets
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_annotation_perms"
down_revision: Union[str, None] = "006_annotation_assets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PID = {
    "media_read": "a0000001-0000-4000-8000-00000000000b",
    "media_write": "a0000001-0000-4000-8000-00000000000c",
    "ann_image_read": "a0000001-0000-4000-8000-00000000000d",
    "ann_image_write": "a0000001-0000-4000-8000-00000000000e",
    "ann_video_read": "a0000001-0000-4000-8000-00000000000f",
    "ann_video_write": "a0000001-0000-4000-8000-000000000010",
    "ann_audio_read": "a0000001-0000-4000-8000-000000000011",
    "ann_audio_write": "a0000001-0000-4000-8000-000000000012",
    "ann_dataset_read": "a0000001-0000-4000-8000-000000000013",
    "ann_dataset_write": "a0000001-0000-4000-8000-000000000014",
}

RID = {
    "OWNER": "b0000001-0000-4000-8000-000000000001",
    "ADMIN": "b0000001-0000-4000-8000-000000000002",
    "ANNOTATOR": "b0000001-0000-4000-8000-000000000003",
    "VIEWER": "b0000001-0000-4000-8000-000000000004",
}


def upgrade() -> None:
    conn = op.get_bind()
    rows = [
        (PID["media_read"], "media:read", "List and view media files"),
        (PID["media_write"], "media:write", "Upload and delete media files"),
        (PID["ann_image_read"], "annotations:image:read", "View image annotation assets"),
        (PID["ann_image_write"], "annotations:image:write", "Create and edit image annotation assets"),
        (PID["ann_video_read"], "annotations:video:read", "View video annotation assets"),
        (PID["ann_video_write"], "annotations:video:write", "Create and edit video annotation assets"),
        (PID["ann_audio_read"], "annotations:audio:read", "View audio annotation assets"),
        (PID["ann_audio_write"], "annotations:audio:write", "Create and edit audio annotation assets"),
        (PID["ann_dataset_read"], "annotations:dataset:read", "View dataset annotation assets"),
        (PID["ann_dataset_write"], "annotations:dataset:write", "Create and edit dataset annotation assets"),
    ]
    for pid, code, desc in rows:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (id, code, description, created_at, deleted_at) "
                "VALUES (CAST(:id AS uuid), :code, :desc, now(), NULL)"
            ),
            {"id": pid, "code": code, "desc": desc},
        )

    def link(role: str, perm_id: str) -> None:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "VALUES (CAST(:rid AS uuid), CAST(:pid AS uuid))"
            ),
            {"rid": RID[role], "pid": perm_id},
        )

    read_perms = [
        PID["media_read"],
        PID["ann_image_read"],
        PID["ann_video_read"],
        PID["ann_audio_read"],
        PID["ann_dataset_read"],
    ]
    write_perms = [
        PID["media_write"],
        PID["ann_image_write"],
        PID["ann_video_write"],
        PID["ann_audio_write"],
        PID["ann_dataset_write"],
    ]

    for r in ("VIEWER", "ANNOTATOR", "ADMIN", "OWNER"):
        for p in read_perms:
            link(r, p)
    for r in ("ANNOTATOR", "ADMIN", "OWNER"):
        for p in write_perms:
            link(r, p)


def downgrade() -> None:
    conn = op.get_bind()
    all_pids = list(PID.values())
    for pid in all_pids:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = CAST(:pid AS uuid)"),
            {"pid": pid},
        )
    for pid in all_pids:
        conn.execute(
            sa.text("DELETE FROM permissions WHERE id = CAST(:pid AS uuid)"),
            {"pid": pid},
        )
