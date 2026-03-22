"""user two-factor columns

Revision ID: 002_twofactor
Revises: 001_initial
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_twofactor"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "two_factor_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("totp_secret", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("two_factor_recovery_cipher", sa.Text(), nullable=True),
    )
    op.alter_column("users", "two_factor_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "two_factor_recovery_cipher")
    op.drop_column("users", "totp_secret")
    op.drop_column("users", "two_factor_enabled")
