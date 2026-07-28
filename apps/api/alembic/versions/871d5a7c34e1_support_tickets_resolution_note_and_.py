"""support tickets resolution note and admin grant

Revision ID: 871d5a7c34e1
Revises: 870064a60891
Create Date: 2026-07-28 01:58:55.921200

Admin support-ticket console (docs/specs/admin-support-ticket-console.md): Admin
needs somewhere to record what they told a ticket's author (audit/context, same
`reason`/`note` convention as a payout reject or an agent-application reject) —
deliberately staff-only, never surfaced in the client's own `GET /tickets`
response (`SupportTicketRead` is untouched; only the new `SupportTicketAdminRead`
exposes this column).

`3c4d5e6f7a8b_add_support_tickets.py` granted `api_user` only `SELECT, INSERT`.
`875b08101bea_grant_update_on_support_tickets.py` (a sibling, independent PR)
later added a column-scoped `UPDATE (subject, body, updated_at)` for the
account-deletion PII scrub — that grant does not cover `status` or this new
column, so Admin's resolve/close action needs its own grant. Column-scoped, not
table-wide, for the same reason that migration gives: RLS's WITH CHECK
constrains which ROWS can be touched, not which COLUMNS, so a table-wide grant
would remove the DB-level backstop against a future bug letting a client rewrite
its own `category`/`subject`. `updated_at` is included because SQLAlchemy's
`onupdate=datetime.utcnow` stamps it on every UPDATE automatically, and Postgres
checks the full emitted SET clause, not just the caller's `.values()` — the
`875b08101bea` migration's docstring documents the exact 500 this omission
caused there.

Both this migration and `875b08101bea` grant `UPDATE (updated_at)` — grants are
idempotent/additive in Postgres (re-granting an already-granted privilege is a
no-op), so this is safe regardless of which of the two independent branches
merges first.

Rollback: drops the grant and the column. Safe pre-use; once any row has a real
resolution_note, dropping the column loses it (standard column-drop caveat).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "871d5a7c34e1"
down_revision: str | Sequence[str] | None = "870064a60891"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("resolution_note", sa.Text(), nullable=True))
    op.execute("GRANT UPDATE (status, resolution_note, updated_at) ON support_tickets TO api_user")


def downgrade() -> None:
    op.execute(
        "REVOKE UPDATE (status, resolution_note, updated_at) ON support_tickets FROM api_user"
    )
    op.drop_column("support_tickets", "resolution_note")
