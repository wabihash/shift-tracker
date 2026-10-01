"""Add weekly break benchmark and per-session break overruns."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261001_02"
down_revision: Union[str, Sequence[str], None] = "20261001_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("weekly_break_target_hours", sa.Float(), nullable=False, server_default="22.1"))
    with op.batch_alter_table("session_logs") as batch_op:
        batch_op.add_column(sa.Column("break_overrun_minutes", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("session_logs") as batch_op:
        batch_op.drop_column("break_overrun_minutes")
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("weekly_break_target_hours")
