"""add loan-config AuditAction enum values

Revision ID: 1dd0bc6bed88
Revises: a1c4e77b93d2
Create Date: 2026-07-28 16:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new labels.

Unblocks the Admin loan-type/bank config CRUD slice (feature-status.md §3 #4):
`services/loan_config.py`'s mutators call `services/audit_log.py::record` with
one of these five actions on every create/update.

Deploy this + restart api/scheduler BEFORE shipping the loan-config CRUD code.
This is a stricter requirement than the precedent
(`c4d5e6f7a8b9_add_loan_status_updated_notification_type.py`): that migration's
caller (`emit_notification`) is best-effort and swallows a stale-enum failure,
silently dropping just the notification. `services/audit_log.py::record` runs
INSIDE the caller's transaction and does not swallow anything — a pooled
connection that never saw these labels will raise, and that exception 500s the
config write itself, not just the audit trail.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (the
label can be left unused, same as every other additive enum value in this
codebase, e.g. c4d5e6f7a8b9).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "1dd0bc6bed88"
down_revision: str | Sequence[str] | None = "a1c4e77b93d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_VALUES = (
    "loan_type_created",
    "loan_type_updated",
    "bank_created",
    "bank_updated",
    "bank_availability_updated",
)


def upgrade() -> None:
    for value in _NEW_VALUES:
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
