"""Rename bedtime_limit to bed_cutoff.

Revision ID: 20260929_01
Revises: 3ffa391cd88b
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260929_01"
down_revision: Union[str, Sequence[str], None] = "3ffa391cd88b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "user_profiles",
        "bedtime_limit",
        new_column_name="bed_cutoff",
        existing_type=sa.Time(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "user_profiles",
        "bed_cutoff",
        new_column_name="bedtime_limit",
        existing_type=sa.Time(),
        existing_nullable=False,
    )
