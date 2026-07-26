"""add lead_released to notification_type enum

Revision ID: b1c2d3e4f5a6
Revises: f4e5d6c7b8a9
Create Date: 2026-07-26 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label.

Lets the admin lead-release/reassign endpoint emit a best-effort notification to
the outgoing telecaller (services/leads.py::release_lead_from_telecaller via
emit_notification). Additive only: no existing row's type changes.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (the
label can be left unused, same as any other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | Sequence[str] | None = "f4e5d6c7b8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'lead_released'")


def downgrade() -> None:
    pass
