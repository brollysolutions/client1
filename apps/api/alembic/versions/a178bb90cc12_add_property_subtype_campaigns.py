"""add property subtype taxonomy and banner campaigns

Revision ID: a178bb90cc12
Revises: f067aa89bb01
Create Date: 2026-08-18 15:30:00.000000
"""

import uuid
from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a178bb90cc12"
down_revision: str | Sequence[str] | None = "f067aa89bb01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SUBTYPES = (
    "individual_house",
    "standalone_apartment",
    "gated_community_apartment",
    "villa",
    "locked_space",
    "unlocked_space",
    "plot",
    "farmland",
    "agriland",
)
_CAMPAIGNS = {
    "individual-house": "Individual House",
    "standalone-apartment": "Standalone Apartment",
    "gated-community-apartment": "Gated Community Apartment",
    "villa": "Villa",
    "locked-space": "Locked Commercial Space",
    "unlocked-space": "Unlocked Commercial Space",
    "plot": "Plot",
    "farmland": "Farmland",
    "agriland": "Agriland",
}
_NAMESPACE = uuid.UUID("de7f8796-a5a9-49f1-87d8-31bb6f440a4a")


def upgrade() -> None:
    bind = op.get_bind()
    subtype_enum = postgresql.ENUM(*_SUBTYPES, name="re_property_subtype")
    subtype_enum.create(bind)
    enum_column = postgresql.ENUM(*_SUBTYPES, name="re_property_subtype", create_type=False)
    op.add_column("properties", sa.Column("property_subtype", enum_column, nullable=True))
    op.add_column("property_submissions", sa.Column("property_subtype", enum_column, nullable=True))

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
                "id": uuid.uuid5(_NAMESPACE, key),
                "placement": "properties",
                "category_key": key,
                "label": label,
                "version": 1,
                "image_ref": f"/banner-templates/properties/{key}.webp",
                "active": True,
                "created_at": datetime(2026, 8, 18),
            }
            for key, label in _CAMPAIGNS.items()
        ],
    )


def downgrade() -> None:
    templates = sa.table("banner_templates", sa.column("id", sa.UUID()))
    template_ids = [uuid.uuid5(_NAMESPACE, key) for key in _CAMPAIGNS]
    op.execute(templates.delete().where(templates.c.id.in_(template_ids)))
    op.drop_column("property_submissions", "property_subtype")
    op.drop_column("properties", "property_subtype")
    postgresql.ENUM(name="re_property_subtype").drop(op.get_bind())
