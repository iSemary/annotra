"""initial schema and rbac seed

Revision ID: 001_initial
Revises:
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PID = {
    "users_read": "a0000001-0000-4000-8000-000000000001",
    "users_manage": "a0000001-0000-4000-8000-000000000002",
    "roles_read": "a0000001-0000-4000-8000-000000000003",
    "roles_manage": "a0000001-0000-4000-8000-000000000004",
    "annotations_read": "a0000001-0000-4000-8000-000000000005",
    "annotations_write": "a0000001-0000-4000-8000-000000000006",
    "billing_manage": "a0000001-0000-4000-8000-000000000007",
    "dashboard_read": "a0000001-0000-4000-8000-000000000008",
}
RID = {
    "OWNER": "b0000001-0000-4000-8000-000000000001",
    "ADMIN": "b0000001-0000-4000-8000-000000000002",
    "ANNOTATOR": "b0000001-0000-4000-8000-000000000003",
    "VIEWER": "b0000001-0000-4000-8000-000000000004",
}


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_companies_slug"),
    )
    op.create_index(op.f("ix_companies_slug"), "companies", ["slug"], unique=False)

    op.create_table(
        "permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_permissions_code"),
    )
    op.create_index(op.f("ix_permissions_code"), "permissions", ["code"], unique=False)

    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("hierarchy_level", sa.Integer(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roles_company_id"), "roles", ["company_id"], unique=False)

    op.create_table(
        "role_permissions",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("permission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
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
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index(op.f("ix_users_company_id"), "users", ["company_id"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.create_index(op.f("ix_users_role_id"), "users", ["role_id"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("replaced_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["replaced_by_id"], ["refresh_tokens.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"], unique=False)
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_actor_user_id"), "audit_logs", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_company_id"), "audit_logs", ["company_id"], unique=False)

    op.create_index(
        "uq_roles_system_name_active",
        "roles",
        ["name"],
        unique=True,
        postgresql_where=sa.text("company_id IS NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_roles_company_name_active",
        "roles",
        ["company_id", "name"],
        unique=True,
        postgresql_where=sa.text("company_id IS NOT NULL AND deleted_at IS NULL"),
    )

    conn = op.get_bind()

    permissions_rows = [
        (PID["users_read"], "users:read", "Read users in company"),
        (PID["users_manage"], "users:manage", "Create/update/delete users"),
        (PID["roles_read"], "roles:read", "View roles"),
        (PID["roles_manage"], "roles:manage", "Manage custom roles"),
        (PID["annotations_read"], "annotations:read", "Read annotations"),
        (PID["annotations_write"], "annotations:write", "Create/edit annotations"),
        (PID["billing_manage"], "billing:manage", "Manage billing"),
        (PID["dashboard_read"], "dashboard:read", "Access dashboard"),
    ]
    for pid, code, desc in permissions_rows:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (id, code, description, created_at, deleted_at) "
                "VALUES (CAST(:id AS uuid), :code, :desc, now(), NULL)"
            ),
            {"id": pid, "code": code, "desc": desc},
        )

    system_roles = [
        (RID["OWNER"], "OWNER", 100),
        (RID["ADMIN"], "ADMIN", 75),
        (RID["ANNOTATOR"], "ANNOTATOR", 50),
        (RID["VIEWER"], "VIEWER", 25),
    ]
    for rid, name, level in system_roles:
        conn.execute(
            sa.text(
                "INSERT INTO roles (id, company_id, name, hierarchy_level, is_system, created_at, deleted_at) "
                "VALUES (CAST(:id AS uuid), NULL, :name, :level, true, now(), NULL)"
            ),
            {"id": rid, "name": name, "level": level},
        )

    def link(role: str, perm_keys: list[str]) -> None:
        for pk in perm_keys:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) "
                    "VALUES (CAST(:rid AS uuid), CAST(:pid AS uuid))"
                ),
                {"rid": RID[role], "pid": PID[pk]},
            )

    link(
        "VIEWER",
        ["users_read", "roles_read", "annotations_read", "dashboard_read"],
    )
    link(
        "ANNOTATOR",
        [
            "users_read",
            "roles_read",
            "annotations_read",
            "annotations_write",
            "dashboard_read",
        ],
    )
    link(
        "ADMIN",
        [
            "users_read",
            "users_manage",
            "roles_read",
            "roles_manage",
            "annotations_read",
            "annotations_write",
            "dashboard_read",
        ],
    )
    link(
        "OWNER",
        [
            "users_read",
            "users_manage",
            "roles_read",
            "roles_manage",
            "annotations_read",
            "annotations_write",
            "billing_manage",
            "dashboard_read",
        ],
    )


def downgrade() -> None:
    op.drop_index("uq_roles_company_name_active", table_name="roles")
    op.drop_index("uq_roles_system_name_active", table_name="roles")
    op.drop_index(op.f("ix_audit_logs_company_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_user_id"), table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_users_role_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_company_id"), table_name="users")
    op.drop_table("users")
    op.drop_table("role_permissions")
    op.drop_index(op.f("ix_roles_company_id"), table_name="roles")
    op.drop_table("roles")
    op.drop_index(op.f("ix_permissions_code"), table_name="permissions")
    op.drop_table("permissions")
    op.drop_index(op.f("ix_companies_slug"), table_name="companies")
    op.drop_table("companies")
