"""Allow annotation_assets.status = failed (processing pipeline).

Revision ID: 009_asset_status_failed
Revises: 008_owner_all_perms
Create Date: 2026-04-11

"""

from typing import Sequence, Union

from alembic import op

revision: str = "009_asset_status_failed"
down_revision: Union[str, None] = "008_owner_all_perms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_annotation_assets_status", "annotation_assets", type_="check")
    op.create_check_constraint(
        "ck_annotation_assets_status",
        "annotation_assets",
        "status IN ('draft','in_progress','completed','reviewed','failed')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_annotation_assets_status", "annotation_assets", type_="check")
    op.create_check_constraint(
        "ck_annotation_assets_status",
        "annotation_assets",
        "status IN ('draft','in_progress','completed','reviewed')",
    )
