"""add property_deal_status_updated to notification_type enum

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-07-23 21:12:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label. Deploy this migration and restart before shipping
the code that emits it (services/property_deals.py::apply_progress_update).

Lets the telecaller/admin property-deal progress endpoint notify the client on
every status change, mirroring loan_status_updated. Additive only: no existing
row's type changes.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (same as
every other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | Sequence[str] | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'property_deal_status_updated'"
    )


def downgrade() -> None:
    pass
