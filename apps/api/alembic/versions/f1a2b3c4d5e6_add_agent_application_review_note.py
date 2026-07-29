"""add review_note to agent_applications

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-07-29 14:00:00.000000

Closes feature-status.md §2-11: `schemas/admin.py::AgentRejectRequest.note`
was accepted from the reviewer and written into the audit_log `detail`
JSONB, but the application row itself had no column to persist it, so an
admin re-opening a rejected application's detail view could not see why it
was rejected without reading the activity log.

Rebased during merge conflict resolution (PRs #135/#137 landed first and
moved the head off c8d9e0f1a2b3, through d1e2f3a4b5c6 -> d2e3f4a5b6c7 ->
e1f2a3b4c5d6): down_revision now points at e1f2a3b4c5d6, the new head.

Plain nullable text column, no GRANT needed: `agent_applications` already
has table-level (not column-scoped) GRANT SELECT/INSERT/UPDATE/DELETE to
api_user from migration a3f2c1d4e5b6, which already covers any new column
added to the same table.

Rollback: drops the column. Data-loss on downgrade is accepted — this
mirrors every other additive nullable-column migration in this codebase
(e.g. the FEE_CASHBACK_* pattern), and no other table references this one.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agent_applications", sa.Column("review_note", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_applications", "review_note")
