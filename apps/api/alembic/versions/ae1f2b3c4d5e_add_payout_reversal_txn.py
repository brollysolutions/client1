"""add payouts.reversal_transaction_id (clawback ledger link)

Revision ID: ae1f2b3c4d5e
Revises: 9d2e3f4a5b6c
Create Date: 2026-07-22 09:00:00.000000

A payout that settles to PAID (webhook `payout.processed`) emits ONE positive
`transactions` ledger row. If the gateway later REVERSES that payment
(`payout.reversed` — funds returned after processing), we must post a
compensating NEGATIVE ledger row so the recipient's balance nets back to zero.

`reversal_transaction_id` links the payout to that clawback row and — combined
with the PAID->REVERSED atomic compare-and-swap in
services.payments.settle_from_webhook — makes the clawback idempotent against
webhook redelivery: only the first `payout.reversed` event both flips the status
and emits the negative row; a redelivered event loses the CAS and no second row
is written.

Additive-only: one nullable column + FK to transactions.id. No enum change, no
data backfill, no contract step (payouts is admin-internal, not in the TS
client). Plain ADD COLUMN — safe through pgBouncer (no enum DDL, ADR-0004 N/A).

Rollback: drop the FK + column. No data migration to reverse.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ae1f2b3c4d5e"
down_revision: str | Sequence[str] | None = "9d2e3f4a5b6c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "payouts",
        sa.Column("reversal_transaction_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_payouts_reversal_transaction_id_transactions"),
        "payouts",
        "transactions",
        ["reversal_transaction_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_payouts_reversal_transaction_id_transactions"),
        "payouts",
        type_="foreignkey",
    )
    op.drop_column("payouts", "reversal_transaction_id")
