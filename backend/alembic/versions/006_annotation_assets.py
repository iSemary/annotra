"""annotation assets, dataset members, annotations

Revision ID: 006_annotation_assets
Revises: 005_media_kind
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006_annotation_assets"
down_revision: Union[str, None] = "005_media_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "annotation_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "file_type",
            sa.String(length=32),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("primary_media_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("frame_count", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "file_type IN ('image','video','audio','dataset')",
            name="ck_annotation_assets_file_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft','in_progress','completed','reviewed')",
            name="ck_annotation_assets_status",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["primary_media_id"], ["media.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_annotation_assets_project_id"),
        "annotation_assets",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_annotation_assets_file_type"),
        "annotation_assets",
        ["file_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_annotation_assets_updated_at"),
        "annotation_assets",
        ["updated_at"],
        unique=False,
    )

    op.create_table(
        "annotation_asset_media",
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["asset_id"], ["annotation_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("asset_id", "media_id"),
    )

    op.create_table(
        "annotations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("annotation_kind", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["annotation_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_annotations_asset_id"),
        "annotations",
        ["asset_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_annotations_asset_id"), table_name="annotations")
    op.drop_table("annotations")
    op.drop_table("annotation_asset_media")
    op.drop_index(op.f("ix_annotation_assets_updated_at"), table_name="annotation_assets")
    op.drop_index(op.f("ix_annotation_assets_file_type"), table_name="annotation_assets")
    op.drop_index(op.f("ix_annotation_assets_project_id"), table_name="annotation_assets")
    op.drop_table("annotation_assets")
