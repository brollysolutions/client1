"""add loan_applications.disbursed_at

Revision ID: 574bd2197b54
Revises: 692dd51658bf
Create Date: 2026-07-29 10:30:00.000000

Fixes a real bug found by review (`docs/specs/agent-commission.md`) in the
agent-commission-entry slice: `services/commissions.py`'s eligible-deal query
and `create_commission`'s revalidation both checked live `status ==
DISBURSED`. DISBURSED is not terminal in the loan status machine
(`services/loan_applications.py::TERMINAL_STATUSES = {CLOSED, REJECTED}`) —
a disbursed loan can (and normally does, eventually) move on to CLOSED, at
which point it silently and permanently dropped out of commission
eligibility with no recovery path, since the terminal-status guard then
blocks any further transition.

`disbursed_at` is an EVENT marker set once, at the moment `status` first
reaches DISBURSED (`apply_progress_update`), mirroring how `closed_at` is
set once at the terminal transition. `services/commissions.py` now checks
`disbursed_at IS NOT NULL` instead of live `status`, so a loan remains
commission-eligible regardless of what happens to its status afterward.

Backfill: only rows CURRENTLY at status='disbursed' are backfilled, using
`opened_at` as a placeholder timestamp (the actual disbursal date isn't
recorded anywhere pre-existing — this repo has no status-transition history
log — so an exact value isn't recoverable; only non-NULLness matters for the
eligibility gate this column feeds). A row already CLOSED (or REJECTED)
before this migration runs has no way to know whether it ever passed
through DISBURSED, so it is deliberately left NULL, not backfilled — at
the time this ships (pre-launch, commission entry not yet a live feature),
no such row exists in any real dataset that would have had a chance to
enter a commission anyway. If one is later discovered in an environment
where this matters, it needs a manual, judgment-based data fix, not a
guessed backfill.

Rollback: drop the column. No data loss beyond the column itself — nothing
else derives from it (commissions rows already entered stay valid; only
future eligibility-queue reads would regress to the pre-fix bug).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "574bd2197b54"
down_revision: str | Sequence[str] | None = "692dd51658bf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "loan_applications",
        sa.Column("disbursed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE loan_applications SET disbursed_at = opened_at WHERE status = 'disbursed'")
    # New columns inherit the table's existing wide INSERT/SELECT grant
    # automatically, but UPDATE on this table is column-scoped (only the
    # mutable status/terms fields get it) — a newly added mutable column
    # needs its own explicit grant, same as every prior expand migration on
    # this table.
    op.execute("GRANT UPDATE (disbursed_at) ON loan_applications TO api_user")


def downgrade() -> None:
    op.execute("REVOKE UPDATE (disbursed_at) ON loan_applications FROM api_user")
    op.drop_column("loan_applications", "disbursed_at")
