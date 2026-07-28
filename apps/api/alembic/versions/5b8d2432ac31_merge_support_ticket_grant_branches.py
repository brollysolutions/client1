"""merge support ticket grant branches

Revision ID: 5b8d2432ac31
Revises: 871d5a7c34e1, 875b08101bea
Create Date: 2026-07-28 05:51:16.586235

PR #120 (`875b08101bea_grant_update_on_support_tickets.py`, the account-deletion
PII scrub) and PR #123 (`870064a60891` → `871d5a7c34e1`, the Admin support-ticket
console) were both branched directly off `main` at `0ca365644939` and both merged.
That left the tree with two Alembic heads, so `alembic upgrade head` aborts with
"Multiple head revisions are present" and *no* migration can be applied — including
any new one. This is an empty merge revision whose only job is to rejoin the two
lineages into a single head.

No schema, no data, no privilege change: both branches touch `support_tickets` but
in disjoint ways (one adds `resolution_note`, the other only grants privileges), and
each already documents that the `UPDATE (updated_at)` grant they share is additive
and order-independent in Postgres. Nothing needs reconciling on the way up.

Rollback: downgrading this revision simply re-splits the two heads; it undoes
nothing. See the sibling fix in each branch's `downgrade()` — they were each
revoking the shared `UPDATE (updated_at)` column privilege, which would have broken
whichever branch was still applied.
"""

from collections.abc import Sequence

revision: str = "5b8d2432ac31"
down_revision: str | Sequence[str] | None = ("871d5a7c34e1", "875b08101bea")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
