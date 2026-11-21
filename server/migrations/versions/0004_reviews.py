"""M5: reviews, the append-only log of answers that FSRS replays on each device

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("seq", sa.Integer, primary_key=True),
        sa.Column("id", sa.String(64), nullable=False, unique=True),
        sa.Column("card_id", sa.String(96), nullable=False, index=True),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column("reviewed_at", sa.String(40), nullable=False, index=True),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("answer", sa.Text),
        sa.Column("duration_ms", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("reviews")
