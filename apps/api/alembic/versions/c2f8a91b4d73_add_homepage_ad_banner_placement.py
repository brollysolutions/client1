"""add the homepage_ad banner placement and seed its sponsor artwork

Revision ID: c2f8a91b4d73
Revises: a178bb90cc12
Create Date: 2026-08-18 20:10:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer, and follow the
rolling-restart procedure for connection-holding services (ADR-0004) — enum DDL
needs a direct connection, and any pooled connection prepared before this runs
will not see the new label.

Adds a fourth public placement: a sponsored strip above the Home page hero
carousel. Additive only; no existing row's placement changes.

WHY THE autocommit_block: PostgreSQL will not let a transaction USE an enum
label that the same transaction added, and env.py runs the whole chain inside
ONE transaction (it does not set transaction_per_migration). The bulk_insert
below references 'homepage_ad', so without the block this migration would
PASS on a fresh database and FAIL on every existing one — PG>=12 exempts a type
created in the same transaction, and ee56ff78aa90 creates banner_placement,
which is exactly the path CI takes. A green CI run is therefore NOT evidence
for this migration; it must be applied to an already-migrated database.
Precedent for the block: e0f1a2b3c4d6_add_payment_methods.py.

EXACTLY ONE CATEGORY KEY, deliberately. The partial unique index
uq_banners_live_placement_category permits one LIVE banner per
(placement, category_key), so a single key makes "only one sponsor runs at a
time" a database guarantee rather than a convention. Queuing the next sponsor
is the existing replacement flow: a Sub Admin authors a replacement carrying
replaces_banner_id, Admin approves it, and jobs/cms_activation.py archives the
incumbent and promotes the successor at its starts_at. That job refuses to
displace a live banner the newcomer does not name, so the queue cannot jump.

The key is not named "offers": services/banners.py treats that literal as magic
and would force every sponsor to link a live Offer.

Rollback deletes exactly the seeded row by recomputing its uuid5 id and leaves
the enum label behind — Postgres has no DROP VALUE, same as every other
additive enum value in this codebase.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c2f8a91b4d73"
down_revision: str | Sequence[str] | None = "a178bb90cc12"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Mirrors app/banner_catalog.py::HOMEPAGE_AD_CATEGORIES.
_CAMPAIGNS = {"sponsor": "Sponsor strip"}
_NAMESPACE = uuid.UUID("6b0d1f2a-8c47-4e93-9a15-7d3ec0f4b268")


def _template_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"homepage_ad:{key}:1")


def upgrade() -> None:
    # New enum labels must commit before writers can use them.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE banner_placement ADD VALUE IF NOT EXISTS 'homepage_ad'")

    templates = sa.table(
        "banner_templates",
        sa.column("id", sa.UUID()),
        sa.column(
            "placement",
            postgresql.ENUM(
                "homepage",
                "financial_services",
                "properties",
                "dashboard",
                "homepage_ad",
                name="banner_placement",
                create_type=False,
            ),
        ),
        sa.column("category_key", sa.Text()),
        sa.column("label", sa.Text()),
        sa.column("version", sa.Integer()),
        sa.column("image_ref", sa.Text()),
        sa.column("active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        templates,
        [
            {
                "id": _template_id(key),
                "placement": "homepage_ad",
                "category_key": key,
                "label": label,
                "version": 1,
                "image_ref": f"/banner-templates/homepage_ad/{key}.webp",
                "active": True,
                "created_at": datetime(2026, 8, 18),
            }
            for key, label in _CAMPAIGNS.items()
        ],
    )


def downgrade() -> None:
    templates = sa.table("banner_templates", sa.column("id", sa.UUID()))
    op.execute(templates.delete().where(templates.c.id.in_([_template_id(k) for k in _CAMPAIGNS])))
