"""Persist cadence weekdays and executed shift numbers."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261001_01"
down_revision: Union[str, Sequence[str], None] = "20260929_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("shift_rules") as batch_op:
        batch_op.add_column(sa.Column("day_of_week", sa.Integer(), nullable=False, server_default="0"))
    op.execute("INSERT INTO shift_rules (profile_id, shift_number, name, standard_start, standard_end, standard_break_minutes, rush_start, rush_end, rush_break_minutes, slot_type, slot_start, slot_end, day_of_week) SELECT profile_id, shift_number, name, standard_start, standard_end, standard_break_minutes, rush_start, rush_end, rush_break_minutes, slot_type, slot_start, slot_end, days.day_of_week FROM shift_rules CROSS JOIN (SELECT 1 AS day_of_week UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) AS days")
    with op.batch_alter_table("session_logs") as batch_op:
        batch_op.add_column(sa.Column("shift_number", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("session_logs") as batch_op:
        batch_op.drop_column("shift_number")
    with op.batch_alter_table("shift_rules") as batch_op:
        batch_op.drop_column("day_of_week")
