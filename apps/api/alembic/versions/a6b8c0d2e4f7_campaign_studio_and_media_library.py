"""move campaign production to Sub Admin and add reusable campaign media

Revision ID: a6b8c0d2e4f7
Revises: f5a7b9c1d3e6
Create Date: 2026-08-28 23:10:00.000000

Reviewed rows are soft-removed so approval evidence and media usage remain
auditable. Existing artwork references are backfilled without changing their
public URLs. Provider logos and private operational uploads are deliberately
outside this table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a6b8c0d2e4f7"
down_revision: str | Sequence[str] | None = "f5a7b9c1d3e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SUB_ADMIN = "current_setting('app.role', true) = 'sub_admin'"
_PLATFORM_ADMIN = (
    "current_setting('app.role', true) = 'admin' "
    "AND current_setting('app.platform_scope', true) = 'true'"
)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in (
            "offer_deleted",
            "campaign_media_created",
            "campaign_media_updated",
            "campaign_media_archived",
            "campaign_media_deleted",
        ):
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")
        for value in (
            "campaign_approved",
            "campaign_changes_requested",
            "campaign_removed",
        ):
            op.execute(f"ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '{value}'")

    for table in ("banners", "offers"):
        op.add_column(
            table,
            sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        )
        op.add_column(table, sa.Column("removed_by_uuid", sa.UUID(), nullable=True))
        op.add_column(table, sa.Column("removal_reason", sa.Text(), nullable=True))
        op.add_column(table, sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_removed_by_uuid_auth_users",
            table,
            "auth_users",
            ["removed_by_uuid"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_check_constraint(
            f"ck_{table}_removal_complete",
            table,
            "(removed_at IS NULL AND removed_by_uuid IS NULL AND removal_reason IS NULL) OR "
            "(removed_at IS NOT NULL AND removal_reason IS NOT NULL)",
        )
        op.create_index(f"ix_{table}_removed_at", table, ["removed_at"])

    op.add_column(
        "offers",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "campaign_media_assets",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans",
                "real_estate",
                "both",
                name="business_line_enum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("usage_type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("alt_text", sa.Text(), nullable=False),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("image_ref", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("source_reference", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "usage_type IN ('public_banner', 'sponsor', 'dashboard_banner', "
            "'dashboard_offer', 'campaign')",
            name="ck_campaign_media_usage_type",
        ),
        sa.CheckConstraint(
            "source_type IN ('bundled', 'upload', 'imported')",
            name="ck_campaign_media_source_type",
        ),
        sa.CheckConstraint(
            "btrim(title) <> '' AND char_length(title) <= 160",
            name="ck_campaign_media_title",
        ),
        sa.CheckConstraint(
            "btrim(alt_text) <> '' AND char_length(alt_text) <= 300",
            name="ck_campaign_media_alt_text",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(tags) = 'array' AND jsonb_array_length(tags) <= 12",
            name="ck_campaign_media_tags",
        ),
        sa.CheckConstraint(
            "image_ref ~ '^/banner-templates/[a-z0-9_/-]+\\.webp$' OR "
            "image_ref ~ '^public/(banner-templates|banners|campaign-media)/[0-9a-f-]+/"
            "[A-Za-z0-9._-]+$'",
            name="ck_campaign_media_safe_image_ref",
        ),
        sa.CheckConstraint("width IS NULL OR width > 0", name="ck_campaign_media_width"),
        sa.CheckConstraint("height IS NULL OR height > 0", name="ck_campaign_media_height"),
        sa.CheckConstraint("byte_size IS NULL OR byte_size > 0", name="ck_campaign_media_size"),
        sa.ForeignKeyConstraint(["created_by_uuid"], ["auth_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("image_ref", name="uq_campaign_media_image_ref"),
    )
    op.create_index("ix_campaign_media_active", "campaign_media_assets", ["active"])
    op.create_index(
        "ix_campaign_media_line_usage",
        "campaign_media_assets",
        ["business_line", "usage_type"],
    )

    op.execute(
        """
        INSERT INTO campaign_media_assets (
            business_line, usage_type, title, alt_text, tags, image_ref,
            mime_type, width, height, byte_size, source_type, source_reference, active
        ) VALUES
        (
            'loans', 'campaign', 'Home loan journey',
            'An Indian couple reviewing a home loan plan together',
            '["generated", "home loan", "family", "starter"]'::jsonb,
            '/banner-templates/starter/home-loan-journey.webp',
            'image/webp', 1774, 887, 91370, 'bundled',
            'Generated starter collection · OpenAI imagegen · 2026-08-28', true
        ),
        (
            'real_estate', 'campaign', 'Verified residence',
            'A landscaped contemporary apartment residence at golden hour',
            '["generated", "property", "residence", "starter"]'::jsonb,
            '/banner-templates/starter/verified-residence.webp',
            'image/webp', 1774, 887, 199754, 'bundled',
            'Generated starter collection · OpenAI imagegen · 2026-08-28', true
        ),
        (
            'both', 'dashboard_offer', 'Rewards and savings',
            'An unbranded gift, shopping bag, coins, and smartphone',
            '["generated", "rewards", "savings", "starter"]'::jsonb,
            '/banner-templates/starter/rewards-and-savings.webp',
            'image/webp', 1774, 887, 55462, 'bundled',
            'Generated starter collection · OpenAI imagegen · 2026-08-28', true
        )
        ON CONFLICT (image_ref) DO NOTHING
        """
    )

    for table in ("banner_templates", "banners", "offers"):
        op.add_column(table, sa.Column("media_asset_id", sa.UUID(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_media_asset_id_campaign_media_assets",
            table,
            "campaign_media_assets",
            ["media_asset_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index(f"ix_{table}_media_asset_id", table, ["media_asset_id"])

    op.execute(
        """
        INSERT INTO campaign_media_assets (
            business_line, usage_type, title, alt_text, tags, image_ref,
            mime_type, source_type, source_reference, active, created_by_uuid,
            created_at
        )
        SELECT
            CASE
                WHEN placement::text = 'financial_services' THEN 'loans'::business_line_enum
                WHEN placement::text = 'properties' THEN 'real_estate'::business_line_enum
                ELSE 'both'::business_line_enum
            END,
            CASE WHEN placement::text = 'homepage_ad' THEN 'sponsor' ELSE 'public_banner' END,
            label || ' artwork',
            label || ' campaign artwork',
            jsonb_build_array(category_key),
            image_ref,
            CASE
                WHEN image_ref ~* '\\.png$' THEN 'image/png'
                WHEN image_ref ~* '\\.(jpg|jpeg)$' THEN 'image/jpeg'
                ELSE 'image/webp'
            END,
            CASE WHEN image_ref LIKE '/banner-templates/%' THEN 'bundled' ELSE 'imported' END,
            'banner_template:' || id::text,
            active,
            created_by_uuid,
            created_at
        FROM banner_templates
        ON CONFLICT (image_ref) DO NOTHING
        """
    )
    op.execute("ALTER TABLE banner_templates DISABLE TRIGGER trg_banner_template_version_immutable")
    op.execute(
        """
        UPDATE banner_templates AS template
        SET media_asset_id = asset.id
        FROM campaign_media_assets AS asset
        WHERE asset.image_ref = template.image_ref
        """
    )
    op.execute("ALTER TABLE banner_templates ENABLE TRIGGER trg_banner_template_version_immutable")
    op.execute(
        """CREATE OR REPLACE FUNCTION enforce_banner_template_version_immutable()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.placement IS DISTINCT FROM NEW.placement
             OR OLD.category_key IS DISTINCT FROM NEW.category_key
             OR OLD.label IS DISTINCT FROM NEW.label
             OR OLD.version IS DISTINCT FROM NEW.version
             OR OLD.image_ref IS DISTINCT FROM NEW.image_ref
             OR OLD.media_asset_id IS DISTINCT FROM NEW.media_asset_id
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
        """
        INSERT INTO campaign_media_assets (
            business_line, usage_type, title, alt_text, image_ref, mime_type,
            source_type, source_reference, active, created_by_uuid, created_at
        )
        SELECT business_line, 'dashboard_banner', 'Imported banner artwork',
               'Campaign artwork', image_key,
               CASE WHEN image_key ~* '\\.png$' THEN 'image/png'
                    WHEN image_key ~* '\\.(jpg|jpeg)$' THEN 'image/jpeg'
                    ELSE 'image/webp' END,
               'imported', 'banner:' || id::text, true, created_by_uuid, created_at
        FROM banners
        WHERE image_key IS NOT NULL
        ON CONFLICT (image_ref) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO campaign_media_assets (
            business_line, usage_type, title, alt_text, image_ref, mime_type,
            source_type, source_reference, active, created_by_uuid, created_at
        )
        SELECT business_line, 'dashboard_offer', 'Imported offer artwork',
               'Offer artwork', image_key,
               CASE WHEN image_key ~* '\\.png$' THEN 'image/png'
                    WHEN image_key ~* '\\.(jpg|jpeg)$' THEN 'image/jpeg'
                    ELSE 'image/webp' END,
               'imported', 'offer:' || id::text, true, created_by_uuid, created_at
        FROM offers
        WHERE image_key IS NOT NULL
        ON CONFLICT (image_ref) DO NOTHING
        """
    )
    op.execute(
        """UPDATE banners SET media_asset_id = asset.id
        FROM campaign_media_assets AS asset WHERE asset.image_ref = banners.image_key"""
    )
    op.execute(
        """UPDATE offers SET media_asset_id = asset.id
        FROM campaign_media_assets AS asset WHERE asset.image_ref = offers.image_key"""
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_media_assets TO api_user")
    op.execute("ALTER TABLE campaign_media_assets ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""CREATE POLICY campaign_media_select ON campaign_media_assets FOR SELECT USING (
        {_SUB_ADMIN})"""
    )
    op.execute(
        f"""CREATE POLICY campaign_media_insert ON campaign_media_assets FOR INSERT WITH CHECK (
        {_SUB_ADMIN} AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))"""
    )
    op.execute(
        f"""CREATE POLICY campaign_media_update ON campaign_media_assets FOR UPDATE USING (
        {_SUB_ADMIN}) WITH CHECK ({_SUB_ADMIN})"""
    )
    op.execute(
        f"""CREATE POLICY campaign_media_delete ON campaign_media_assets FOR DELETE USING (
        {_SUB_ADMIN})"""
    )
    op.execute(
        """CREATE FUNCTION enforce_campaign_media_identity_immutable()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.image_ref IS DISTINCT FROM NEW.image_ref
             OR OLD.created_by_uuid IS DISTINCT FROM NEW.created_by_uuid
             OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION 'campaign media identity is immutable';
          END IF;
          RETURN NEW;
        END;
        $$"""
    )
    op.execute(
        """CREATE TRIGGER trg_campaign_media_identity_immutable
        BEFORE UPDATE ON campaign_media_assets FOR EACH ROW
        EXECUTE FUNCTION enforce_campaign_media_identity_immutable()"""
    )
    op.execute(
        """CREATE FUNCTION enforce_offer_creator_immutable()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.created_by_uuid IS DISTINCT FROM NEW.created_by_uuid THEN
            RAISE EXCEPTION 'offer creator is immutable';
          END IF;
          RETURN NEW;
        END;
        $$"""
    )
    op.execute(
        """CREATE TRIGGER trg_offer_creator_immutable BEFORE UPDATE ON offers
        FOR EACH ROW EXECUTE FUNCTION enforce_offer_creator_immutable()"""
    )

    op.execute("DROP POLICY IF EXISTS banner_templates_insert ON banner_templates")
    op.execute("DROP POLICY IF EXISTS banner_templates_update ON banner_templates")
    op.execute(
        f"""CREATE POLICY banner_templates_insert ON banner_templates FOR INSERT WITH CHECK (
        {_SUB_ADMIN})"""
    )
    op.execute(
        f"""CREATE POLICY banner_templates_update ON banner_templates FOR UPDATE USING (
        {_SUB_ADMIN}) WITH CHECK ({_SUB_ADMIN})"""
    )

    op.execute("DROP POLICY IF EXISTS banners_insert ON banners")
    op.execute("DROP POLICY IF EXISTS banners_update ON banners")
    op.execute(
        f"""CREATE POLICY banners_insert ON banners FOR INSERT WITH CHECK (
        {_SUB_ADMIN}
        AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text = 'draft' AND removed_at IS NULL)"""
    )
    op.execute(
        f"""CREATE POLICY banners_update ON banners FOR UPDATE USING (
        {_SUB_ADMIN} AND removed_at IS NULL AND status::text IN ('draft', 'rejected'))
        WITH CHECK ({_SUB_ADMIN} AND removed_at IS NULL
                    AND status::text IN ('draft', 'pending_approval', 'rejected'))"""
    )

    op.execute("GRANT DELETE ON offers TO api_user")
    op.execute("DROP POLICY IF EXISTS offers_insert ON offers")
    op.execute("DROP POLICY IF EXISTS offers_update ON offers")
    op.execute(
        f"""CREATE POLICY offers_insert ON offers FOR INSERT WITH CHECK (
        {_SUB_ADMIN}
        AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text = 'draft' AND removed_at IS NULL)"""
    )
    op.execute(
        f"""CREATE POLICY offers_update ON offers FOR UPDATE USING (
        ({_SUB_ADMIN} AND removed_at IS NULL) OR ({_PLATFORM_ADMIN} AND removed_at IS NULL))
        WITH CHECK ({_SUB_ADMIN} OR ({_PLATFORM_ADMIN}))"""
    )
    op.execute(
        f"""CREATE POLICY offers_delete ON offers FOR DELETE USING (
        {_SUB_ADMIN} AND status::text = 'draft' AND removed_at IS NULL)"""
    )


def downgrade() -> None:
    op.execute(
        """CREATE OR REPLACE FUNCTION enforce_banner_template_version_immutable()
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
    op.execute("DROP POLICY IF EXISTS offers_delete ON offers")
    op.execute("DROP POLICY IF EXISTS offers_update ON offers")
    op.execute("DROP POLICY IF EXISTS offers_insert ON offers")
    op.execute("REVOKE DELETE ON offers FROM api_user")
    op.execute(
        f"""CREATE POLICY offers_insert ON offers FOR INSERT WITH CHECK (
        {_SUB_ADMIN} AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text = 'draft')"""
    )
    op.execute(
        f"""CREATE POLICY offers_update ON offers FOR UPDATE USING (
        ({_SUB_ADMIN} AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
        OR ({_PLATFORM_ADMIN})) WITH CHECK (
        ({_SUB_ADMIN} AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
        OR ({_PLATFORM_ADMIN}))"""
    )
    op.execute("DROP POLICY IF EXISTS banners_update ON banners")
    op.execute("DROP POLICY IF EXISTS banners_insert ON banners")
    op.execute(
        """CREATE POLICY banners_insert ON banners FOR INSERT WITH CHECK (
        (current_setting('app.role', true) IN ('sub_admin', 'admin'))
        AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        AND status::text = 'draft')"""
    )
    op.execute(
        """CREATE POLICY banners_update ON banners FOR UPDATE USING (
        current_setting('app.role', true) IN ('sub_admin', 'admin')
        AND status::text IN ('draft', 'rejected')) WITH CHECK (
        status::text IN ('draft', 'pending_approval', 'rejected'))"""
    )
    op.execute("DROP POLICY IF EXISTS banner_templates_update ON banner_templates")
    op.execute("DROP POLICY IF EXISTS banner_templates_insert ON banner_templates")
    op.execute(
        f"""CREATE POLICY banner_templates_insert ON banner_templates FOR INSERT WITH CHECK (
        {_PLATFORM_ADMIN})"""
    )
    op.execute(
        f"""CREATE POLICY banner_templates_update ON banner_templates FOR UPDATE USING (
        {_PLATFORM_ADMIN}) WITH CHECK ({_PLATFORM_ADMIN})"""
    )
    op.execute("DROP TRIGGER IF EXISTS trg_offer_creator_immutable ON offers")
    op.execute("DROP FUNCTION IF EXISTS enforce_offer_creator_immutable()")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_campaign_media_identity_immutable ON campaign_media_assets"
    )
    op.execute("DROP FUNCTION IF EXISTS enforce_campaign_media_identity_immutable()")
    for policy in ("delete", "update", "insert", "select"):
        op.execute(f"DROP POLICY IF EXISTS campaign_media_{policy} ON campaign_media_assets")
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON campaign_media_assets FROM api_user")
    for table in ("offers", "banners", "banner_templates"):
        op.drop_index(f"ix_{table}_media_asset_id", table_name=table)
        op.drop_constraint(
            f"fk_{table}_media_asset_id_campaign_media_assets", table, type_="foreignkey"
        )
        op.drop_column(table, "media_asset_id")
    op.drop_index("ix_campaign_media_line_usage", table_name="campaign_media_assets")
    op.drop_index("ix_campaign_media_active", table_name="campaign_media_assets")
    op.drop_table("campaign_media_assets")
    op.drop_column("offers", "updated_at")
    for table in ("offers", "banners"):
        op.drop_index(f"ix_{table}_removed_at", table_name=table)
        op.drop_constraint(f"ck_{table}_removal_complete", table, type_="check")
        op.drop_constraint(f"fk_{table}_removed_by_uuid_auth_users", table, type_="foreignkey")
        for column in ("removed_at", "removal_reason", "removed_by_uuid", "version"):
            op.drop_column(table, column)
