"""Grant system OWNER role every permission (present and future DB rows).

Revision ID: 008_owner_all_perms
Revises: 007_annotation_perms
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_owner_all_perms"
down_revision: Union[str, None] = "007_annotation_perms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OWNER_ROLE_ID = "b0000001-0000-4000-8000-000000000001"


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT CAST(:owner_id AS uuid), p.id
            FROM permissions p
            WHERE p.deleted_at IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM role_permissions rp
                WHERE rp.role_id = CAST(:owner_id AS uuid)
                  AND rp.permission_id = p.id
            )
            """
        ),
        {"owner_id": OWNER_ROLE_ID},
    )


def downgrade() -> None:
    """No-op: we cannot know which OWNER links were pre-existing vs added here."""
