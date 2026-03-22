"""projects table and projects permissions

Revision ID: 003_projects
Revises: 002_twofactor
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_projects"
down_revision: Union[str, None] = "002_twofactor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PID_PROJECTS_READ = "a0000001-0000-4000-8000-000000000009"
PID_PROJECTS_MANAGE = "a0000001-0000-4000-8000-00000000000a"

RID = {
    "OWNER": "b0000001-0000-4000-8000-000000000001",
    "ADMIN": "b0000001-0000-4000-8000-000000000002",
    "ANNOTATOR": "b0000001-0000-4000-8000-000000000003",
    "VIEWER": "b0000001-0000-4000-8000-000000000004",
}


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_company_id"), "projects", ["company_id"], unique=False)

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, code, description, created_at, deleted_at) "
            "VALUES (CAST(:id AS uuid), :code, :desc, now(), NULL)"
        ),
        {
            "id": PID_PROJECTS_READ,
            "code": "projects:read",
            "desc": "List and view projects in company",
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, code, description, created_at, deleted_at) "
            "VALUES (CAST(:id AS uuid), :code, :desc, now(), NULL)"
        ),
        {
            "id": PID_PROJECTS_MANAGE,
            "code": "projects:manage",
            "desc": "Create, update, and delete projects",
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
        link(r, PID_PROJECTS_READ)
    for r in ("ADMIN", "OWNER"):
        link(r, PID_PROJECTS_MANAGE)


def downgrade() -> None:
    conn = op.get_bind()
    for r in ("OWNER", "ADMIN", "ANNOTATOR", "VIEWER"):
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE role_id = CAST(:rid AS uuid) "
                "AND permission_id = CAST(:pid AS uuid)"
            ),
            {"rid": RID[r], "pid": PID_PROJECTS_READ},
        )
    for r in ("OWNER", "ADMIN"):
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE role_id = CAST(:rid AS uuid) "
                "AND permission_id = CAST(:pid AS uuid)"
            ),
            {"rid": RID[r], "pid": PID_PROJECTS_MANAGE},
        )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE id = CAST(:id AS uuid)"),
        {"id": PID_PROJECTS_READ},
    )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE id = CAST(:id AS uuid)"),
        {"id": PID_PROJECTS_MANAGE},
    )
    op.drop_index(op.f("ix_projects_company_id"), table_name="projects")
    op.drop_table("projects")
