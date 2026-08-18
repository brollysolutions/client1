"""add property-backed banner campaigns

Revision ID: f067aa89bb01
Revises: ee56ff78aa90
Create Date: 2026-08-18 11:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f067aa89bb01"
down_revision: str | Sequence[str] | None = "ee56ff78aa90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("banners", sa.Column("property_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_banners_property_id_properties",
        "banners",
        "properties",
        ["property_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_banners_property_id", "banners", ["property_id"])
    op.create_check_constraint(
        "ck_banners_single_linked_promotion",
        "banners",
        "offer_id IS NULL OR property_id IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_banners_single_linked_promotion", "banners", type_="check")
    op.drop_index("ix_banners_property_id", table_name="banners")
    op.drop_constraint("fk_banners_property_id_properties", "banners", type_="foreignkey")
    op.drop_column("banners", "property_id")
