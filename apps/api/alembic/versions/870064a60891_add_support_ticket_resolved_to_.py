"""add support_ticket_resolved to notification_type enum

Revision ID: 870064a60891
Revises: 0ca365644939
Create Date: 2026-07-28 01:58:44.952717

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label. Deploy this migration and restart before shipping
the code that emits it (services/support_tickets.py::advance_ticket).

Lets a support-ticket resolution/close notify the ticket's own author, mirroring
loan_status_updated and referral_converted. Additive only: no existing row's
type changes.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (same as
every other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "870064a60891"
down_revision: str | Sequence[str] | None = "0ca365644939"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'support_ticket_resolved'")


def downgrade() -> None:
    pass
