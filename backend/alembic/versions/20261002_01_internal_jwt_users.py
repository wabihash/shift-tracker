"""Add first-party users and internal ownership IDs.

Legacy Clerk rows remain unassigned because their owning email cannot be inferred
from the old subject ID. A verified account migration can backfill user_id later.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261002_01"
down_revision: Union[str, Sequence[str], None] = "20261001_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    for table in ("user_profiles", "planned_shifts", "session_logs"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
            batch.create_foreign_key(f"fk_{table}_user_id_users", "users", ["user_id"], ["id"])
            batch.drop_index(f"ix_{table}_clerk_user_id")
            batch.drop_column("clerk_user_id")
            if table == "user_profiles":
                batch.drop_column("wake_time")
                batch.drop_column("bed_cutoff")
                batch.drop_column("weekly_break_target_hours")
        op.create_index(f"ix_{table}_user_id", table, ["user_id"], unique=table == "user_profiles")


def downgrade() -> None:
    for table in ("user_profiles", "planned_shifts", "session_logs"):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(f"fk_{table}_user_id_users", type_="foreignkey")
            batch.drop_column("user_id")
            batch.add_column(sa.Column("clerk_user_id", sa.String(length=255), nullable=True))
            batch.create_index(f"ix_{table}_clerk_user_id", ["clerk_user_id"], unique=table == "user_profiles")
    with op.batch_alter_table("user_profiles") as batch:
        batch.add_column(sa.Column("wake_time", sa.Time(), nullable=False, server_default="00:00:00"))
        batch.add_column(sa.Column("bed_cutoff", sa.Time(), nullable=False, server_default="00:00:00"))
        batch.add_column(sa.Column("weekly_break_target_hours", sa.Float(), nullable=False, server_default="0"))
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
