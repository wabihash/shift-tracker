"""Add configurable schedule slot fields to shift rules."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260929_02"
down_revision: Union[str, Sequence[str], None] = "20260929_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("shift_rules") as batch_op:
        batch_op.add_column(sa.Column("slot_type", sa.String(length=16), nullable=False, server_default="productive"))
        batch_op.add_column(sa.Column("slot_start", sa.Time(), nullable=True))
        batch_op.add_column(sa.Column("slot_end", sa.Time(), nullable=True))
    op.execute("UPDATE shift_rules SET slot_start = standard_start, slot_end = standard_end")


def downgrade() -> None:
    with op.batch_alter_table("shift_rules") as batch_op:
        batch_op.drop_column("slot_end")
        batch_op.drop_column("slot_start")
        batch_op.drop_column("slot_type")
