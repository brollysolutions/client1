"""backfill non-conforming banners.image_key to NULL (public/ image serving)

Revision ID: a5b6c7d8e9f0
Revises: f1a2b3c4d5e6
Create Date: 2026-07-30 00:00:00.000000

Slice §2-13 (banner images end-to-end) introduces a write-side validator on
BannerCreate/BannerUpdate (schemas/banners.py's _IMAGE_KEY_PATTERN) requiring
every new image_key to match `public/banners/{uuid4}/{name}` -- the shape the
bucket policy's `public/*` prefix and services/storage.py::public_asset_url
both assume. Before this slice, image_key was a free-text input
(banner-form.tsx) with no shape constraint at all, so any row saved before
today may hold a value that does not conform (empty string, a pasted key from
a different prefix, a typo). public_asset_url already returns None for
anything outside `public/`, so a non-conforming key degrades safely on read --
this migration is not a correctness fix, it is closing the same door from the
data side, on the theory that a stored value that looks like it might be a
storage key deserves not to sit there indefinitely once it can never resolve
to a real image.

Irreversible in the sense that any cleared value is not recoverable from the
column alone (there is no history table) -- logged here so the affected row
ids are on record before the UPDATE runs, per this repo's data-migration
convention (see e.g. retention_purge.py's own audit-before-mutate stance).
Expected count is zero on every environment that has never had a banner save
image_key before this slice shipped; this migration exists for the case
that isn't true.

NOTE: Run directly against postgres:5432, not pgBouncer, for consistency with
sibling banner migrations (ADR-0004) -- no enum DDL/GRANT/RLS here, so it does
not strictly require it, same footnote as d8e9f0a1b2c3.

Rebased during merge conflict resolution (PRs #135/#137/#138 landed first and
moved the head off c8d9e0f1a2b3, through d1e2f3a4b5c6 -> d2e3f4a5b6c7 ->
e1f2a3b4c5d6 -> f1a2b3c4d5e6): down_revision now points at f1a2b3c4d5e6, the
new head.

Rollback: no-op. A cleared image_key cannot be un-cleared by downgrade(); the
downgrade only documents that fact, it does not restore data.
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

logger = logging.getLogger("alembic.runtime.migration")

# Mirrors schemas/banners.py's _IMAGE_KEY_PATTERN exactly (Postgres POSIX
# regex, not Python re -- equivalent syntax for this pattern).
_CONFORMING_KEY_REGEX = (
    r"^public/banners/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    r"/[A-Za-z0-9._-]+$"
)


def upgrade() -> None:
    bind = op.get_bind()
    offending = bind.execute(
        sa.text(
            "SELECT id, image_key FROM banners "
            "WHERE image_key IS NOT NULL AND image_key !~ :pattern"
        ),
        {"pattern": _CONFORMING_KEY_REGEX},
    ).fetchall()
    for row in offending:
        logger.warning(
            "banners_public_image_key_backfill: nulling non-conforming image_key "
            "on banner id=%s (was %r)",
            row.id,
            row.image_key,
        )
    if offending:
        op.execute(
            sa.text(
                "UPDATE banners SET image_key = NULL "
                "WHERE image_key IS NOT NULL AND image_key !~ :pattern"
            ).bindparams(pattern=_CONFORMING_KEY_REGEX)
        )


def downgrade() -> None:
    # Deliberately not implemented -- see module docstring's Rollback note.
    pass
