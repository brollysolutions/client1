"""add lead_assigned to notification_type enum

Revision ID: f7d8c9a0b1e2
Revises: e6c7b8f9a0d1
Create Date: 2026-07-22 12:10:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label.

Lets the admin lead-assign endpoint emit a best-effort notification to the
telecaller (services/leads.py::assign_lead_to_telecaller via emit_notification),
so the Telecaller Dashboard home's notifications preview has something to show.
Additive only: no existing row's type changes.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (the
label can be left unused, same as any other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f7d8c9a0b1e2"
down_revision: str | Sequence[str] | None = "e6c7b8f9a0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'lead_assigned'")


def downgrade() -> None:
    pass
