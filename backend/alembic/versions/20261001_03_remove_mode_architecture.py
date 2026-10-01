"""Remove retired alternate schedule fields and day overrides."""
from typing import Sequence, Union

from alembic import op


revision: str = "20261001_03"
down_revision: Union[str, Sequence[str], None] = "20261001_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("shift_rules") as batch_op:
        batch_op.drop_column("rush_break_minutes")
        batch_op.drop_column("rush_end")
        batch_op.drop_column("rush_start")
    op.drop_table("day_overrides")


def downgrade() -> None:
    op.create_table(
        "day_overrides",
        op.Column("id", op.Integer(), primary_key=True),
        op.Column("clerk_user_id", op.String(length=255), nullable=False),
        op.Column("override_date", op.Date(), nullable=False),
        op.Column("mode", op.String(length=64), nullable=False),
        op.Column("reason", op.String(length=500), nullable=True),
    )
    with op.batch_alter_table("shift_rules") as batch_op:
        batch_op.add_column(op.Column("rush_start", op.Time(), nullable=True))
        batch_op.add_column(op.Column("rush_end", op.Time(), nullable=True))
        batch_op.add_column(op.Column("rush_break_minutes", op.Integer(), nullable=False, server_default="0"))