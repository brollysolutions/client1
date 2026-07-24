"""payouts: partial-unique index on gateway_payout_id

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-07-24 15:00:00.000000

`gateway_payout_id` was only ever de-duplicated at the app layer: the
reconciler's `_backfill_gateway_id` (services.payments) guards its own write
on `gateway_payout_id IS NULL`, and `settle_from_webhook` looks a payout up
by exact match, but nothing stopped two DISTINCT payout rows from ending up
with the same RazorpayX id at the database level (a reconcile-vs-webhook
race backfilling two different rows from the same `reference_id` search, or
a future bug). Two rows sharing a gateway id would make `settle_from_webhook`
match `scalar()` non-deterministically and could double-settle the wrong
payout.

Additive-only: one partial-unique index, NULL-safe (Postgres UNIQUE never
constrains NULLs, but the explicit WHERE keeps the intent obvious and matches
the existing `uq_payouts_idem_active` style). Admin-driven write volume is low
(per the payouts table docstring), so a plain (non-CONCURRENTLY) index build
is acceptable — no production traffic contention concern here, unlike a
user-facing table.

Rollback: drop the index. No data migration to reverse.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c6d7e8f9a0b1"
down_revision: str | Sequence[str] | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_payouts_gateway_payout_id",
        "payouts",
        ["gateway_payout_id"],
        unique=True,
        postgresql_where=sa.text("gateway_payout_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_payouts_gateway_payout_id", table_name="payouts")
