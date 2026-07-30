"""partial indexes on commissions/fee_cashbacks/referrals payout-link columns

Revision ID: d2e3f4a5b6c7
Revises: d1e2f3a4b5c6
Create Date: 2026-07-29 12:05:00.000000

Unblocks services/payout_links.py::reconcile_payout_links (feature-status.md
§2 #15): every sweep query joins payouts to one of commissions.payout_uuid,
fee_cashbacks.payout_uuid, or referrals.reward_payout_uuid, and none of the
three had an index before this — every 30-minute tick would seq-scan the
full table. Partial (WHERE ... IS NOT NULL) because the large majority of
rows on all three tables are unlinked (only PENDING/ACCRUED rows an admin
has actually paid ever get a payout_uuid at all); a full index would carry
dead weight for no query this codebase runs. These also speed up the
existing release_payout_link UPDATE in each of the three services, which was
seq-scanning on every payout rejection/failure/reversal before this.

Plain transactional CREATE INDEX (matches a2b3c4d5e6f7's "effectively empty
pre-launch" precedent) rather than CREATE INDEX CONCURRENTLY. If real
production volume exists by the time this deploys, switch to
op.get_context().autocommit_block() per .claude/rules/database-postgres.md.

Rollback: downgrade drops all three indexes.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: str | Sequence[str] | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (index name, table, column)
_INDEXES = [
    ("ix_commissions_payout_uuid", "commissions", "payout_uuid"),
    ("ix_fee_cashbacks_payout_uuid", "fee_cashbacks", "payout_uuid"),
    ("ix_referrals_reward_payout_uuid", "referrals", "reward_payout_uuid"),
]


def upgrade() -> None:
    for name, table, column in _INDEXES:
        op.create_index(name, table, [column], postgresql_where=sa.text(f"{column} IS NOT NULL"))


def downgrade() -> None:
    for name, table, _column in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
