"""expand governed homepage sponsor themes and keep one live slot

Revision ID: d3a9b72c5e41
Revises: c2f8a91b4d73
Create Date: 2026-08-19 08:00:00.000000

The five new templates are additive, text-free bundled artwork. Sub Admins can
select them for campaign copy, while platform Admins retain the existing
template-version upload authority.

The original single sponsor category made the general
uq_banners_live_placement_category index equivalent to a one-slot rule. Once
multiple themes exist, that index alone would permit one LIVE banner per theme.
The placement-only partial unique index below preserves the product invariant
at the database boundary. The scheduler separately requires a cross-theme
replacement to name the current live campaign before it can displace it.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d3a9b72c5e41"
down_revision: str | Sequence[str] | None = "c2f8a91b4d73"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CAMPAIGNS = {
    "personal-finance": "Personal finance",
    "business-finance": "Business finance",
    "cards-and-rewards": "Cards and rewards",
    "insurance-protection": "Insurance and protection",
    "verified-property": "Verified property",
}
_NAMESPACE = uuid.UUID("6b0d1f2a-8c47-4e93-9a15-7d3ec0f4b268")


def _template_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"homepage_ad:{key}:1")


def upgrade() -> None:
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
                "created_at": datetime(2026, 8, 19),
            }
            for key, label in _CAMPAIGNS.items()
        ],
    )
    op.create_index(
        "uq_banners_live_homepage_ad_placement",
        "banners",
        ["placement"],
        unique=True,
        postgresql_where=sa.text(
            "status = 'live'::banner_status AND placement = 'homepage_ad'::banner_placement"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_banners_live_homepage_ad_placement", table_name="banners")
    templates = sa.table("banner_templates", sa.column("id", sa.UUID()))
    op.execute(templates.delete().where(templates.c.id.in_([_template_id(k) for k in _CAMPAIGNS])))
