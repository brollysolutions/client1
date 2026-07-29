"""add commission AuditAction enum values

Revision ID: 9af869604ca2
Revises: a2b3c4d5e6f7
Create Date: 2026-07-29 09:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new labels.

Unblocks the agent-commission entry slice (feature-status.md §3 #5, first
half): `services/commissions.py`'s create/cancel mutators call
`services/audit_log.py::record` with one of these two actions. Same ordering
requirement as the precedent (`1dd0bc6bed88`): `record()` runs INSIDE the
caller's transaction and does not swallow a stale-enum failure, so this must
land and the api/scheduler restart before the commission-entry code ships.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (same
as every other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "9af869604ca2"
down_revision: str | Sequence[str] | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_VALUES = (
    "commission_entered",
    "commission_cancelled",
)


def upgrade() -> None:
    for value in _NEW_VALUES:
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
