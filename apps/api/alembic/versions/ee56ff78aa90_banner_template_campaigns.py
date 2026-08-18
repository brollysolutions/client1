"""add template-governed banner campaigns

Revision ID: ee56ff78aa90
Revises: dd45ee67ff89
Create Date: 2026-08-17 19:30:00.000000
"""

import uuid
from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "ee56ff78aa90"
down_revision: str | Sequence[str] | None = "dd45ee67ff89"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PLACEMENTS = ("homepage", "financial_services", "properties", "dashboard")
_CATALOG = {
    "homepage": {
        "loans": "Loans",
        "offers": "Attractive offers",
        "general": "General",
        "properties": "Properties",
        "referrals": "Referral programmes",
        "core-concepts": "How Dhanadhara works",
    },
    "financial_services": {
        "personal-loan": "Personal Loan",
        "business-loan": "Business Loan",
        "home-loan": "Home Loan",
        "loan-against-property": "Loan Against Property",
        "car-loan": "Car Loan",
        "vehicle-loan": "Vehicle Loan",
        "education-loan": "Education Loan",
        "school-funding": "School Funding",
        "secured-loans": "Secured Loans",
        "od-and-dod": "OD and DOD",
        "project-funding": "Project Funding",
        "life-insurance": "Life Insurance",
        "health-insurance": "Health Insurance",
        "property-insurance": "Property Insurance",
        "travel-insurance": "Travel Insurance",
        "credit-cards": "Credit Cards",
    },
    "properties": {
        "apartments": "Apartments",
        "houses": "Houses",
        "villas": "Villas",
        "plots-land": "Plots and Land",
        "commercial": "Commercial",
        "offers": "Property offers",
        "guidance-general": "Property guidance",
    },
}


def upgrade() -> None:
    bind = op.get_bind()
    placement_enum = postgresql.ENUM(*_PLACEMENTS, name="banner_placement")
    placement_enum.create(bind)

    op.create_table(
        "banner_templates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "placement",
            postgresql.ENUM(*_PLACEMENTS, name="banner_placement", create_type=False),
            nullable=False,
        ),
        sa.Column("category_key", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("image_ref", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["created_by_uuid"], ["auth_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "placement", "category_key", "version", name="uq_banner_template_version"
        ),
        sa.CheckConstraint(
            "image_ref ~ '^/banner-templates/[a-z0-9_/-]+\\.webp$' "
            "OR image_ref ~ '^public/banner-templates/[0-9a-f-]+/[A-Za-z0-9._-]+$'",
            name="safe_image_ref",
        ),
    )
    op.create_index(
        "uq_banner_templates_active_category",
        "banner_templates",
        ["placement", "category_key"],
        unique=True,
        postgresql_where=sa.text("active"),
    )
    op.execute(
        """CREATE FUNCTION enforce_banner_template_version_immutable()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.placement IS DISTINCT FROM NEW.placement
             OR OLD.category_key IS DISTINCT FROM NEW.category_key
             OR OLD.label IS DISTINCT FROM NEW.label
             OR OLD.version IS DISTINCT FROM NEW.version
             OR OLD.image_ref IS DISTINCT FROM NEW.image_ref
             OR OLD.created_by_uuid IS DISTINCT FROM NEW.created_by_uuid
             OR OLD.created_at IS DISTINCT FROM NEW.created_at
             OR OLD.active = false
             OR NEW.active = true THEN
            RAISE EXCEPTION 'banner template versions are immutable';
          END IF;
          RETURN NEW;
        END;
        $$"""
    )
    op.execute(
        """CREATE TRIGGER trg_banner_template_version_immutable
        BEFORE UPDATE ON banner_templates FOR EACH ROW
        EXECUTE FUNCTION enforce_banner_template_version_immutable()"""
    )

    op.add_column(
        "banners",
        sa.Column(
            "placement",
            postgresql.ENUM(*_PLACEMENTS, name="banner_placement", create_type=False),
            nullable=True,
        ),
    )
    op.add_column("banners", sa.Column("category_key", sa.Text(), nullable=True))
    op.add_column("banners", sa.Column("template_id", sa.UUID(), nullable=True))
    op.add_column("banners", sa.Column("offer_id", sa.UUID(), nullable=True))
    op.add_column("banners", sa.Column("replaces_banner_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_banners_template_id_banner_templates",
        "banners",
        "banner_templates",
        ["template_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_banners_offer_id_offers",
        "banners",
        "offers",
        ["offer_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_banners_replaces_banner_id_banners",
        "banners",
        "banners",
        ["replaces_banner_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        "UPDATE banners SET placement = CASE WHEN banner_type::text = 'personalized' "
        "THEN 'dashboard'::banner_placement ELSE 'homepage'::banner_placement END"
    )
    op.alter_column("banners", "placement", nullable=False)
    op.create_index(
        "uq_banners_live_placement_category",
        "banners",
        ["placement", "category_key"],
        unique=True,
        postgresql_where=sa.text("status = 'live'::banner_status AND category_key IS NOT NULL"),
    )
    op.execute(
        """CREATE FUNCTION enforce_banner_campaign_identity_immutable()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.created_by_uuid IS DISTINCT FROM NEW.created_by_uuid
             OR OLD.placement IS DISTINCT FROM NEW.placement
             OR OLD.replaces_banner_id IS DISTINCT FROM NEW.replaces_banner_id THEN
            RAISE EXCEPTION 'banner campaign identity is immutable';
          END IF;
          RETURN NEW;
        END;
        $$"""
    )
    op.execute(
        """CREATE TRIGGER trg_banner_campaign_identity_immutable
        BEFORE UPDATE ON banners FOR EACH ROW
        EXECUTE FUNCTION enforce_banner_campaign_identity_immutable()"""
    )

    templates = sa.table(
        "banner_templates",
        sa.column("id", sa.UUID()),
        sa.column(
            "placement",
            postgresql.ENUM(*_PLACEMENTS, name="banner_placement", create_type=False),
        ),
        sa.column("category_key", sa.Text()),
        sa.column("label", sa.Text()),
        sa.column("version", sa.Integer()),
        sa.column("image_ref", sa.Text()),
        sa.column("active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    namespace = uuid.UUID("cf1fbcb6-27f5-4ac8-a7e4-f2e8518ff803")
    now = datetime(2026, 8, 17)
    op.bulk_insert(
        templates,
        [
            {
                "id": uuid.uuid5(namespace, f"{placement}:{key}:1"),
                "placement": placement,
                "category_key": key,
                "label": label,
                "version": 1,
                "image_ref": f"/banner-templates/{placement}/{key}.webp",
                "active": True,
                "created_at": now,
            }
            for placement, categories in _CATALOG.items()
            for key, label in categories.items()
        ],
    )

    for value in (
        "banner_created",
        "banner_updated",
        "banner_submitted",
        "banner_approved",
        "banner_rejected",
        "banner_archived",
        "banner_activated",
        "banner_deleted",
        "banner_template_versioned",
    ):
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")

    op.execute("GRANT SELECT, INSERT, UPDATE ON banner_templates TO api_user")
    op.execute("ALTER TABLE banner_templates ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY banner_templates_select ON banner_templates FOR SELECT USING (
        current_setting('app.role', true) IN ('sub_admin', 'admin'))"""
    )
    op.execute(
        """CREATE POLICY banner_templates_insert ON banner_templates FOR INSERT WITH CHECK (
        current_setting('app.role', true) = 'admin'
        AND current_setting('app.platform_scope', true) = 'true')"""
    )
    op.execute(
        """CREATE POLICY banner_templates_update ON banner_templates FOR UPDATE USING (
        current_setting('app.role', true) = 'admin'
        AND current_setting('app.platform_scope', true) = 'true') WITH CHECK (
        current_setting('app.role', true) = 'admin'
        AND current_setting('app.platform_scope', true) = 'true')"""
    )

    op.execute("DROP POLICY banners_insert ON banners")
    op.execute("DROP POLICY banners_update ON banners")
    op.execute("GRANT DELETE ON banners TO api_user")
    op.execute(
        """CREATE POLICY banners_insert ON banners FOR INSERT WITH CHECK (
        (current_setting('app.role', true) = 'sub_admin'
         OR (current_setting('app.role', true) = 'admin'
             AND current_setting('app.platform_scope', true) = 'true'))
        AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text = 'draft')"""
    )
    op.execute(
        """CREATE POLICY banners_update ON banners FOR UPDATE USING (
        (current_setting('app.role', true) = 'sub_admin'
         OR (current_setting('app.role', true) = 'admin'
             AND current_setting('app.platform_scope', true) = 'true'))
        AND status::text IN ('draft', 'rejected')) WITH CHECK (
        status::text IN ('draft', 'pending_approval', 'rejected'))"""
    )
    op.execute(
        """CREATE POLICY banners_delete ON banners FOR DELETE USING (
        current_setting('app.role', true) = 'sub_admin' AND status::text = 'draft')"""
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_banner_campaign_identity_immutable ON banners")
    op.execute("DROP FUNCTION IF EXISTS enforce_banner_campaign_identity_immutable()")
    op.execute("DROP POLICY IF EXISTS banners_delete ON banners")
    op.execute("DROP POLICY IF EXISTS banners_update ON banners")
    op.execute("DROP POLICY IF EXISTS banners_insert ON banners")
    op.execute("REVOKE DELETE ON banners FROM api_user")
    op.execute(
        """CREATE POLICY banners_insert ON banners FOR INSERT WITH CHECK (
        current_setting('app.role', true) = 'sub_admin'
        AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text = 'draft')"""
    )
    op.execute(
        """CREATE POLICY banners_update ON banners FOR UPDATE USING (
        current_setting('app.role', true) = 'sub_admin'
        AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text IN ('draft', 'rejected')) WITH CHECK (
        created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text IN ('draft', 'pending_approval', 'rejected'))"""
    )
    op.execute("DROP POLICY IF EXISTS banner_templates_update ON banner_templates")
    op.execute("DROP POLICY IF EXISTS banner_templates_insert ON banner_templates")
    op.execute("DROP POLICY IF EXISTS banner_templates_select ON banner_templates")
    op.execute("ALTER TABLE banner_templates DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON banner_templates FROM api_user")
    op.drop_index("uq_banners_live_placement_category", table_name="banners")
    op.drop_constraint("fk_banners_replaces_banner_id_banners", "banners", type_="foreignkey")
    op.drop_constraint("fk_banners_offer_id_offers", "banners", type_="foreignkey")
    op.drop_constraint("fk_banners_template_id_banner_templates", "banners", type_="foreignkey")
    op.drop_column("banners", "replaces_banner_id")
    op.drop_column("banners", "offer_id")
    op.drop_column("banners", "template_id")
    op.drop_column("banners", "category_key")
    op.drop_column("banners", "placement")
    op.execute("DROP TRIGGER IF EXISTS trg_banner_template_version_immutable ON banner_templates")
    op.execute("DROP FUNCTION IF EXISTS enforce_banner_template_version_immutable()")
    op.drop_index("uq_banner_templates_active_category", table_name="banner_templates")
    op.drop_table("banner_templates")
    postgresql.ENUM(name="banner_placement").drop(op.get_bind())
