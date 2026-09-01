"""rent/lease listing intent + external listing links on properties

Revision ID: c8d0e2f4a6b9
Revises: b7c9d1e3f5a8
Create Date: 2026-08-29 14:10:00.000000

The real-estate catalog was sale-only: no column distinguished a listing offered
for sale from one offered to rent, and `format_inr_display` rendered every
price as lakh/crore. This adds the intent axis plus the three terms a rental
listing actually needs, and a structured place for author-supplied links to the
property elsewhere (YouTube/Instagram/Facebook).

`re_listing_intent` is deliberately two-valued (`sale`, `rent`). Indian practice
separates short-term rent from long-term/commercial lease, but they share every
field captured here, so one `rent` intent labelled "Rent / Lease" carries both.
Splitting later is `ALTER TYPE ... ADD VALUE`, the additive shape used by every
other enum extension in this tree.

Expand-only, no backfill query needed:

- `listing_intent` is NOT NULL with server_default 'sale'. Every pre-existing
  row WAS a sale listing, so the default is an exact backfill rather than a
  placeholder. The default is kept (not dropped after fill) because 'sale' stays
  the correct default for any writer that omits the column. ADD COLUMN with a
  non-volatile default is catalog-only on PG11+ — no rewrite, no scan.
- The three rent terms are nullable with no default. NULL is permanent and
  legitimate: it means "not a rental". The schema layer rejects them unless
  `listing_intent` is 'rent', so NULL can never mean "a rental we forgot to
  price".
- `listing_links` is JSONB NULL, a capped list of {url, platform}. JSONB rather
  than a child table: it is capped at 4, only ever read with its parent, and a
  child table would need its own policy + grants for no benefit.

Money stays integer minor units — `security_deposit_paise` is BIGINT for the
same reason `price_paise` is (a deposit can exceed int32 paise).

RLS: not touched, and no new policy is needed. `properties_rls` (bf2c3d4e5a6b,
re-stated in a0b1c2d3e4f5) is `FOR SELECT` over `active` plus the admin/sub-admin
scope, and `property_submissions` policies key on `submitter_uuid` and role —
both are row-level predicates with no column dimension, which Postgres RLS does
not have. GRANT: not touched either. `GRANT SELECT ON properties` (bf2c3d4e5a6b)
+ `GRANT UPDATE ON properties` (cc34dd56ee78) and `GRANT SELECT, INSERT ON
property_submissions` (c3d4e5f6a7b8) are all table-wide, so they already cover
columns added later.

No new table, so scripts/check_migration_rls.py needs no rls-exempt marker here.

Enum DDL: CREATE TYPE must run on a direct postgres:5432 connection, NOT through
pgBouncer, and connection-holding services need the rolling restart described in
ADR-0004.

Rollback: downgrade() drops the four columns and the enum type, destroying any
authored rent terms and links, and any rental listing's price_display string
stays "₹25,000/month" while nothing explains it any more. Revert the app image
FIRST, then `alembic downgrade -1` — otherwise SubmissionCreate payloads that
still send listing_intent fail on an unknown column. Prefer rolling forward once
any rental listing has been approved.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c8d0e2f4a6b9"
down_revision: str | Sequence[str] | None = "b7c9d1e3f5a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INTENT_VALUES = ("sale", "rent")
_TABLES = ("properties", "property_submissions")


def upgrade() -> None:
    bind = op.get_bind()
    listing_intent = postgresql.ENUM(*_INTENT_VALUES, name="re_listing_intent")
    listing_intent.create(bind, checkfirst=True)

    intent_type = postgresql.ENUM(*_INTENT_VALUES, name="re_listing_intent", create_type=False)
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column(
                "listing_intent",
                intent_type,
                nullable=False,
                server_default="sale",
            ),
        )
        op.add_column(table, sa.Column("security_deposit_paise", sa.BigInteger(), nullable=True))
        op.add_column(table, sa.Column("minimum_lease_months", sa.SmallInteger(), nullable=True))
        op.add_column(table, sa.Column("available_from", sa.Date(), nullable=True))
        op.add_column(table, sa.Column("listing_links", postgresql.JSONB(), nullable=True))

    # The catalog is filtered by intent on every browse request once the UI ships.
    # Partial on active rows only, matching how the public catalog reads.
    op.create_index(
        "ix_properties_listing_intent",
        "properties",
        ["listing_intent"],
        postgresql_where=sa.text("active"),
    )


def downgrade() -> None:
    op.drop_index("ix_properties_listing_intent", table_name="properties")
    for table in _TABLES:
        op.drop_column(table, "listing_links")
        op.drop_column(table, "available_from")
        op.drop_column(table, "minimum_lease_months")
        op.drop_column(table, "security_deposit_paise")
        op.drop_column(table, "listing_intent")
    postgresql.ENUM(name="re_listing_intent").drop(op.get_bind(), checkfirst=True)
