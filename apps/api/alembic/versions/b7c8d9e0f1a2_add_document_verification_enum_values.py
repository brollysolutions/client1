"""add document-verification enum values (FR-7.4)

Revision ID: b7c8d9e0f1a2
Revises: f5a6b7c8d9e0
Create Date: 2026-07-29 12:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new labels.

Unblocks the unified Admin document-verification slice
(feature-status.md §2 row 4): `services/document_verification.py::set_verification`
calls `services/audit_log.py::record` with one of the two new AuditAction
values, and emits a notification with the new NotificationType value on
unverify. Same ordering requirement as every prior enum-value migration:
`record()`/`emit_notification()` run inside (or alongside) the caller's
transaction and do not swallow a stale-enum failure, so this must land and
the api/scheduler restart happen before the verification service code ships.

Three values across two enum types, one concern (document verification) —
this repo's convention groups enum-value additions by concern, not
mechanically one value per migration (9af869604ca2 already set this
precedent by adding two AuditAction values in one file).

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (same
as every other additive enum value in this codebase).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "f5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_AUDIT_ACTION_VALUES = (
    "document_verified",
    "document_unverified",
)
_NEW_NOTIFICATION_TYPE_VALUES = ("document_review_updated",)


def upgrade() -> None:
    for value in _NEW_AUDIT_ACTION_VALUES:
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")
    for value in _NEW_NOTIFICATION_TYPE_VALUES:
        op.execute(f"ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
