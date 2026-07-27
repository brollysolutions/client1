"""add referral_converted to notification_type enum

Revision ID: 8a7b6c5d4e3f
Revises: 9f8e7d6c5b4a
Create Date: 2026-07-27 12:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label. Deploy this migration and restart before shipping
the code that emits it (services/referrals.py::record_conversion).

Lets a referral conversion notify the referrer, mirroring loan_status_updated
and property_deal_status_updated. Additive only: no existing row's type changes.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (same as
every other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "8a7b6c5d4e3f"
down_revision: str | Sequence[str] | None = "9f8e7d6c5b4a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_converted'")


def downgrade() -> None:
    pass
