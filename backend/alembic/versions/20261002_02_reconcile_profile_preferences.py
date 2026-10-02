"""Remove retired preference columns left by the initial JWT migration."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261002_02"
down_revision: Union[str, Sequence[str], None] = "20261002_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_columns = {
        column["name"] for column in inspector.get_columns("user_profiles")
    }
    retired_columns = {
        "wake_time",
        "bed_cutoff",
        "weekly_break_target_hours",
    } & existing_columns

    if retired_columns:
        with op.batch_alter_table("user_profiles") as batch:
            for column in sorted(retired_columns):
                batch.drop_column(column)


def downgrade() -> None:
    # Retired preference values cannot be restored accurately.
    pass
