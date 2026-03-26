"""media.kind enum column

Revision ID: 005_media_kind
Revises: 004_media
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_media_kind"
down_revision: Union[str, None] = "004_media"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("media", sa.Column("kind", sa.String(length=32), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE media SET kind = CASE
                WHEN mime_type LIKE 'image/%%' THEN 'image'
                WHEN mime_type LIKE 'video/%%' THEN 'video'
                WHEN mime_type LIKE 'audio/%%' THEN 'audio'
                WHEN mime_type LIKE 'model/%%' THEN 'model_3d'
                WHEN mime_type = 'application/x-blender' THEN 'model_3d'
                ELSE 'image'
            END
            """
        )
    )
    op.alter_column("media", "kind", nullable=False)
    op.create_check_constraint(
        "ck_media_kind_values",
        "media",
        "kind IN ('image','video','audio','model_3d')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_media_kind_values", "media", type_="check")
    op.drop_column("media", "kind")
