"""add subtitle + cta_label to banners (public banner serving, PR B)

Revision ID: d8e9f0a1b2c3
Revises: c1d2e3f4a5b6
Create Date: 2026-07-27 00:00:00.000000

The public hero carousel (docs/specs/public-banner-serving.md) renders a title,
a subtitle paragraph, and a CTA button label. `banners` only had `title` and
`deep_link` (the CTA href) — this migration adds the two missing copy fields
so authored banners can reach parity with the hardcoded hero they replace.

Expand-only: both columns are nullable with no server default. No backfill —
NULL is a legitimate, permanent value for every existing and future row (a
banner author may not want a subtitle or a custom button label; the frontend
falls back to no-paragraph / a generic label). ADD COLUMN ... NULL with no
default is catalog-only on PG11+, no table rewrite, no scan.

RLS: not touched. banners_select/_insert/_update are row-level predicates over
app.role, created_by_uuid, and status only (see a4b5c6d7e8f9) — they have no
column dimension, and Postgres RLS itself has none. GRANT: not touched either
-- `GRANT SELECT, INSERT, UPDATE ON banners TO api_user` (a4b5c6d7e8f9) is
table-wide (verified via \\dp banners: empty Column-privileges column), so it
already covers columns added later.

No enum DDL, no GRANT, no policy DDL here, so unlike a4b5c6d7e8f9 this migration
does not strictly require bypassing pgBouncer -- kept on the direct connection
anyway for consistency with sibling banner migrations (ADR-0004).

Rollback: downgrade() drops both columns, destroying any authored subtitle/
cta_label copy. Safe order is revert the app image FIRST, then
`alembic downgrade -1` -- otherwise BannerCreate/BannerUpdate payloads that
still send these fields fail on an unknown column. If a LIVE banner already
carries a cta_label, its CTA button disappears from the public hero on
rollback (the hardcoded fallback array does not cover this case, since a live
banner row still exists and takes priority over the fallback). Prefer rolling
forward over rolling back once any banner has gone live with these fields set.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: str | Sequence[str] | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("banners", sa.Column("subtitle", sa.Text(), nullable=True))
    op.add_column("banners", sa.Column("cta_label", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("banners", "cta_label")
    op.drop_column("banners", "subtitle")
