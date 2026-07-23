"""add task_assigned to notification_type enum

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6a7
Create Date: 2026-07-23 09:10:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label.

Lets the admin task-assign endpoint emit a best-effort notification to the
employee (services/tasks.py::assign_task_to_employee via emit_notification).
Additive only: no existing row's type changes.

Rollback: Postgres has no DROP VALUE for an enum; downgrade is a no-op (the
label can be left unused, same as f7d8c9a0b1e2's lead_assigned addition).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_assigned'")


def downgrade() -> None:
    pass
