"""add loan_status_updated to notification_type enum

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-23 12:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label.

Lets the loan-application progress endpoints (telecaller PATCH, admin PATCH)
emit a best-effort notification to the client on every status transition
(services/loan_applications.py via emit_notification). Additive only: no
existing row's type changes.

Deploy this + restart api/scheduler BEFORE shipping the emitting code — a
pooled connection that never sees the new label makes emit_notification's
INSERT throw, which it swallows (best-effort), silently dropping the
notification rather than erroring the triggering PATCH.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (the
label can be left unused, same as any other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'loan_status_updated'")


def downgrade() -> None:
    pass
