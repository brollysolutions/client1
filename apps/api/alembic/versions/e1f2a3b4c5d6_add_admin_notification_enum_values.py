"""add admin-notification NotificationType values + NOTIFICATION_BROADCAST AuditAction

Revision ID: e1f2a3b4c5d6
Revises: d2e3f4a5b6c7
Create Date: 2026-07-29 13:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new labels.

Unblocks services/admin_notify.py (FR-11.3 + feature-status.md §3 #12):
`notify_admins` writes one of the three ADMIN_* NotificationType values;
`broadcast` writes ADMIN_BROADCAST plus one NOTIFICATION_BROADCAST AuditAction
row per send. Same ordering requirement as every other additive-enum-value
precedent in this codebase: the writers do not swallow a stale-enum failure,
so this must land and the api/scheduler restart before that code ships.

Rebased during merge conflict resolution (PR #135's payout-link-reconcile
migrations, d1e2f3a4b5c6 + d2e3f4a5b6c7, landed first and moved the head off
c8d9e0f1a2b3): down_revision now points at d2e3f4a5b6c7, the new head.
Alembic requires a single linear head (scripts/verify-api.sh asserts this).

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (same
as every other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_NOTIFICATION_TYPES = (
    "admin_payout_reviewed",
    "admin_account_action",
    "admin_retention_purged",
    "admin_broadcast",
)


def upgrade() -> None:
    for value in _NEW_NOTIFICATION_TYPES:
        op.execute(f"ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '{value}'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'notification_broadcast'")


def downgrade() -> None:
    pass
