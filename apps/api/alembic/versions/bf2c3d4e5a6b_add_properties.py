"""add properties table + enums + RLS

Revision ID: bf2c3d4e5a6b
Revises: ae1f2b3c4d5e
Create Date: 2026-07-22 12:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

properties is the real-estate listing CATALOG (read-only this slice). Unlike
enquiries/site_visits/bookmarks it is NOT user-owned, so its RLS is
catalog-shaped: every authenticated user sees `active` listings; platform
Admin/Sub Admin (platform_scope='true') additionally see inactive ones. There
is deliberately NO user_uuid owner branch and NO business_line line predicate
(the catalog is public-equivalent; a line predicate would only risk a
both/loans-only visibility regression). business_line is stamped 'real_estate'
and kept immutable via the shared trigger for segregation/analytics only.

Typed facet columns mirror the frontend REListing so the generated TS contract
is fully typed and the client-side filter engine consumes the response
unchanged; `details` (JSONB) is overflow. Money is BIGINT minor units
(price_paise), never a float.

No producer exists yet (listings go live via the Admin-approved
property_submissions workflow, a later slice), so this table ships EMPTY in
production; only SELECT is granted to api_user, and dev is populated by
app.scripts.seed_properties.

Rollback: drop policy, disable RLS, revoke grant, drop trigger, drop table
(drops indexes), drop the 3 enums.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "bf2c3d4e5a6b"
down_revision: str | Sequence[str] | None = "ae1f2b3c4d5e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CATEGORY_VALUES = ("houses", "apartments", "villas", "plots", "commercial")
_FURNISHING_VALUES = ("unfurnished", "semi", "furnished")
_CONSTRUCTION_VALUES = ("ready", "under_construction")

# Shared immutability trigger function (defined once in e5f6a7b8c9d0).
_FN = "enforce_business_line_immutable"

# Shared catalog: active listings are visible to everyone authenticated; admin
# (platform_scope) additionally sees inactive rows. No owner/line branch.
_RLS_PREDICATE = "active = true OR current_setting('app.platform_scope', true) = 'true'"


def upgrade() -> None:
    bind = op.get_bind()

    category_enum = postgresql.ENUM(*_CATEGORY_VALUES, name="re_property_category")
    category_enum.create(bind)
    furnishing_enum = postgresql.ENUM(*_FURNISHING_VALUES, name="re_furnishing")
    furnishing_enum.create(bind)
    construction_enum = postgresql.ENUM(*_CONSTRUCTION_VALUES, name="re_construction_status")
    construction_enum.create(bind)

    op.create_table(
        "properties",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("location", sa.String(length=160), nullable=False),
        sa.Column("price_display", sa.String(length=40), nullable=False),
        sa.Column("meta", sa.String(length=120), nullable=True),
        sa.Column("image", sa.String(length=200), nullable=True),
        sa.Column(
            "category",
            postgresql.ENUM(*_CATEGORY_VALUES, name="re_property_category", create_type=False),
            nullable=False,
        ),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("locality", sa.String(length=120), nullable=False),
        sa.Column("pincode", sa.String(length=6), nullable=False),
        sa.Column("price_paise", sa.BigInteger(), nullable=False),
        sa.Column("bhk", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("area_sqft", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "furnishing",
            postgresql.ENUM(*_FURNISHING_VALUES, name="re_furnishing", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "construction_status",
            postgresql.ENUM(
                *_CONSTRUCTION_VALUES, name="re_construction_status", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "amenities",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("age_years", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("rera_number", sa.String(length=40), nullable=False),
        sa.Column(
            "details",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_properties")),
    )
    # RLS hot column. Filtering is client-side, so no facet indexes are needed.
    op.create_index(op.f("ix_properties_active"), "properties", ["active"])

    op.execute(
        f"CREATE TRIGGER trg_properties_business_line_immutable "
        f"BEFORE UPDATE ON properties "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT ON properties TO api_user")
    op.execute("ALTER TABLE properties ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY properties_rls ON properties
        FOR SELECT
        USING ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS properties_rls ON properties")
    op.execute("ALTER TABLE properties DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON properties FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_properties_business_line_immutable ON properties")
    op.drop_table("properties")
    postgresql.ENUM(name="re_construction_status").drop(op.get_bind())
    postgresql.ENUM(name="re_furnishing").drop(op.get_bind())
    postgresql.ENUM(name="re_property_category").drop(op.get_bind())
