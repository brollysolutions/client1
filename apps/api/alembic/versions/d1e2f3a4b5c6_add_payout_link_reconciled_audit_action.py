"""add payout_link_reconciled AuditAction enum value

Revision ID: d1e2f3a4b5c6
Revises: c8d9e0f1a2b3
Create Date: 2026-07-29 12:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label.

Unblocks services/payout_links.py::reconcile_payout_links, which calls
services/audit_log.py::record with this action once per sweep that repairs a
drifted referral/commission/fee_cashback payout link. Same ordering
requirement as every other additive-enum-value precedent in this codebase
(e.g. 9af869604ca2): record() runs inside the caller's transaction and does
not swallow a stale-enum failure, so this must land and the api/scheduler
restart before the reconciliation job first runs.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (same
as every other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: str | Sequence[str] | None = "c8d9e0f1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'payout_link_reconciled'")


def downgrade() -> None:
    pass
