"""grant update on support_tickets

Revision ID: 875b08101bea
Revises: 0ca365644939
Create Date: 2026-07-27 17:37:48.788811

`3c4d5e6f7a8b_add_support_tickets.py` deliberately granted `api_user` only
`SELECT, INSERT` on this table, withholding `UPDATE` "until a ticket-edit/close
endpoint actually ships" (that migration's own docstring). Account deletion
(SRS 5.1, `services/account_deletion.py`) now needs to scrub a deleted
identity's own `subject`/`body` free text, and `support_tickets_rls`'s WITH
CHECK already has a genuine owner-or-admin branch (see
`a0b1c2d3e4f5_rls_scope_platform_bypass_to_admin.py`) — the same shape as
`client_profiles`/`agent_profiles`, which that service's Phase A already
writes under the caller's own RLS-scoped session. The only real blocker was
this privilege grant, not RLS, so this migration is the root-cause fix rather
than routing the scrub through the bypass session.

Pure privilege change: no schema, no data. Reversible.

Column-scoped, not table-wide: the only caller (services/account_deletion.py)
ever writes `subject`/`body` (`updated_at` is included because the model's
`onupdate=datetime.utcnow` makes SQLAlchemy stamp it on every UPDATE
automatically — Postgres checks column privileges against the full SET
clause it actually emits, not just the columns the caller passed to
`.values()`, so omitting it here 500s every single account deletion, not
just the scrub). RLS's WITH CHECK constrains which ROWS can be touched, not
which COLUMNS — granting the full table would silently remove the DB-level
backstop that would otherwise catch a future bug (e.g. a careless
ticket-edit endpoint letting a client rewrite its own `status`/`category`).
Column privileges are the narrower, still-correct grant for the one write
path that actually exists today (security review finding, 2026-07-28).

`downgrade()` deliberately revokes only `subject`/`body`, NOT the shared
`updated_at`: the sibling branch `871d5a7c34e1` (Admin support-ticket console) also
depends on that column privilege, and unlike GRANT, REVOKE is *not* additive — one
REVOKE drops the single underlying privilege however many times it was granted.
Revoking it here would 500 every Admin ticket resolve while that sibling is still
applied. See that migration's docstring for the same note from the other side.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "875b08101bea"
down_revision: str | Sequence[str] | None = "0ca365644939"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("GRANT UPDATE (subject, body, updated_at) ON support_tickets TO api_user")


def downgrade() -> None:
    op.execute("REVOKE UPDATE (subject, body) ON support_tickets FROM api_user")
