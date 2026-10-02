"""Persist each profile's weekly anchor day."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261003_01"
down_revision: Union[str, Sequence[str], None] = "20261002_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column("week_start_day", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("user_profiles", "week_start_day")
