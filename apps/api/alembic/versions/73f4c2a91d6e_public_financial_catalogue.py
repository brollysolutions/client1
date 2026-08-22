"""publishable financial catalogue, provider metadata, and provider offers

Revision ID: 73f4c2a91d6e
Revises: a7b8c9d0e1f2
Create Date: 2026-08-22

Anonymous publication is deliberately separate from the authenticated product
form and the permissive operational availability matrix.  New products and
offers default private.  No provider, logo, term, or product-offer row is
seeded: the supplied lender names still require canonical identity and asset
provenance review.

Provider logos are reusable provider metadata.  Managed Admin uploads are
staged privately, scanned/canonicalized, and copied under
``public/provider-logos``; repository-reviewed SVGs use a local
``/provider-logos`` path.  There is no external lender destination column.
"""

# ruff: noqa: E501 -- governed SQL backfill remains readable as one statement.

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "73f4c2a91d6e"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""


def upgrade() -> None:
    op.add_column(
        "loan_types",
        sa.Column("public_visible", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("loan_types", sa.Column("public_summary", sa.String(length=280)))
    op.add_column("loan_types", sa.Column("public_description", sa.Text()))
    for column in (
        "public_highlights",
        "public_eligibility",
        "public_documents",
        "public_faq",
    ):
        op.add_column(
            "loan_types",
            sa.Column(
                column,
                postgresql.JSONB(),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )
        op.create_check_constraint(
            f"ck_loan_types_{column}_array",
            "loan_types",
            f"jsonb_typeof({column}) = 'array'",
        )
    op.add_column(
        "loan_types",
        sa.Column("homepage_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "loan_types",
        sa.Column("homepage_feature_order", sa.Integer(), nullable=False, server_default="1000"),
    )
    # Preserve the products that were already public code-owned cards before
    # this migration. Newly created or previously non-public rows retain the
    # fail-closed defaults and require explicit Admin publication.
    op.execute(
        sa.text(
            """
            UPDATE loan_types
            SET public_visible = true,
                public_summary = label || ' with guided Dhanadhara support.',
                public_description =
                    'Understand the journey, review configured providers, and apply or enquire '
                    'inside Dhanadhara. Provider terms are informational and subject to review.',
                public_highlights = '["Internal assisted journey", "Provider options in one place"]'::jsonb,
                public_eligibility = '["Eligibility and approval are assessed by the selected provider"]'::jsonb,
                public_documents = '["Documents are requested only during the secure application journey"]'::jsonb,
                public_faq = '[{"question":"Is approval guaranteed?","answer":"No. The selected provider completes its own eligibility and credit assessment."}]'::jsonb,
                homepage_featured = name IN (
                    'personal-loan', 'business-loan', 'home-loan',
                    'loan-against-property', 'car-loan', 'education-loan'
                ),
                homepage_feature_order = CASE name
                    WHEN 'personal-loan' THEN 1
                    WHEN 'business-loan' THEN 2
                    WHEN 'home-loan' THEN 3
                    WHEN 'loan-against-property' THEN 4
                    WHEN 'car-loan' THEN 5
                    WHEN 'education-loan' THEN 6
                    ELSE 1000
                END
            WHERE name IN (
                'personal-loan', 'business-loan', 'home-loan', 'loan-against-property',
                'car-loan', 'education-loan', 'vehicle-loan', 'equipment-financing',
                'school-funding', 'secured-loans', 'credit-cards', 'life-insurance',
                'health-insurance', 'property-insurance', 'travel-insurance', 'project-funding'
            ) AND active = true
            """
        )
    )
    op.create_check_constraint(
        "ck_loan_types_homepage_featured_is_public",
        "loan_types",
        "NOT homepage_featured OR public_visible",
    )
    op.create_check_constraint(
        "ck_loan_types_homepage_feature_order",
        "loan_types",
        "homepage_feature_order BETWEEN 0 AND 10000",
    )

    op.add_column("banks", sa.Column("legal_name", sa.String(length=200)))
    op.add_column(
        "banks",
        sa.Column("provider_type", sa.String(length=32), nullable=False, server_default="bank"),
    )
    op.add_column("banks", sa.Column("logo_source", sa.String(length=500)))
    op.add_column("banks", sa.Column("logo_verified_at", sa.DateTime(timezone=True)))
    op.create_check_constraint(
        "ck_banks_provider_type",
        "banks",
        "provider_type IN ('bank', 'small_finance_bank', 'nbfc', 'hfc', 'fintech', 'other')",
    )

    op.create_table(
        "financial_product_provider_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("loan_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bank_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("offer_name", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.String(length=500)),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("min_amount", sa.Numeric(14, 2)),
        sa.Column("max_amount", sa.Numeric(14, 2)),
        sa.Column("min_interest_rate", sa.Numeric(6, 3)),
        sa.Column("max_interest_rate", sa.Numeric(6, 3)),
        sa.Column("min_tenure_months", sa.Integer()),
        sa.Column("max_tenure_months", sa.Integer()),
        sa.Column("processing_fee_text", sa.String(length=240)),
        sa.Column("eligibility_summary", sa.String(length=500)),
        sa.Column("last_verified_at", sa.DateTime(timezone=True)),
        sa.Column("created_by_uuid", postgresql.UUID(as_uuid=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "display_order BETWEEN 0 AND 10000", name="ck_provider_offers_display_order"
        ),
        sa.CheckConstraint(
            "min_amount IS NULL OR min_amount >= 0", name="ck_provider_offers_min_amount"
        ),
        sa.CheckConstraint(
            "max_amount IS NULL OR max_amount >= COALESCE(min_amount, 0)",
            name="ck_provider_offers_amount_range",
        ),
        sa.CheckConstraint(
            "min_interest_rate IS NULL OR min_interest_rate BETWEEN 0 AND 100",
            name="ck_provider_offers_min_rate",
        ),
        sa.CheckConstraint(
            "max_interest_rate IS NULL OR (max_interest_rate BETWEEN 0 AND 100 "
            "AND max_interest_rate >= COALESCE(min_interest_rate, 0))",
            name="ck_provider_offers_rate_range",
        ),
        sa.CheckConstraint(
            "min_tenure_months IS NULL OR min_tenure_months BETWEEN 1 AND 600",
            name="ck_provider_offers_min_tenure",
        ),
        sa.CheckConstraint(
            "max_tenure_months IS NULL OR (max_tenure_months BETWEEN 1 AND 600 "
            "AND max_tenure_months >= COALESCE(min_tenure_months, 1))",
            name="ck_provider_offers_tenure_range",
        ),
        sa.CheckConstraint(
            "NOT published OR last_verified_at IS NOT NULL",
            name="ck_provider_offers_published_verified",
        ),
        sa.ForeignKeyConstraint(["loan_type_id"], ["loan_types.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["bank_id"], ["banks.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_uuid"], ["auth_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_provider_offers_product_public_order",
        "financial_product_provider_offers",
        ["loan_type_id", "published", "display_order"],
    )
    op.create_index(
        "ix_provider_offers_bank_id",
        "financial_product_provider_offers",
        ["bank_id"],
    )
    for table in ("loan_applications", "financial_service_enquiries"):
        op.add_column(
            table,
            sa.Column("preferred_provider_offer_id", postgresql.UUID(as_uuid=True)),
        )
        op.add_column(table, sa.Column("provider_offer_snapshot", postgresql.JSONB()))
        op.create_foreign_key(
            f"fk_{table}_preferred_provider_offer_id",
            table,
            "financial_product_provider_offers",
            ["preferred_provider_offer_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(
            f"ix_{table}_preferred_provider_offer_id",
            table,
            ["preferred_provider_offer_id"],
        )

    op.execute(
        "GRANT UPDATE (public_visible, public_summary, public_description, "
        "public_highlights, public_eligibility, public_documents, public_faq, "
        "homepage_featured, homepage_feature_order) ON loan_types TO api_user"
    )
    op.execute(
        "GRANT UPDATE (legal_name, provider_type, logo_source, logo_verified_at) "
        "ON banks TO api_user"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON financial_product_provider_offers TO api_user")
    op.execute("ALTER TABLE financial_product_provider_offers ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY provider_offers_select ON financial_product_provider_offers
        FOR SELECT USING (published OR ({_ADMIN}))
        """
    )
    op.execute(
        f"""
        CREATE POLICY provider_offers_insert ON financial_product_provider_offers
        FOR INSERT WITH CHECK ({_ADMIN})
        """
    )
    op.execute(
        f"""
        CREATE POLICY provider_offers_update ON financial_product_provider_offers
        FOR UPDATE USING ({_ADMIN}) WITH CHECK ({_ADMIN})
        """
    )

    # PostgreSQL enum values cannot be removed on downgrade. These labels are
    # additive and remain harmless if the feature schema is rolled back.
    for value in ("financial_product_offer_created", "financial_product_offer_updated"):
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    for table in ("financial_service_enquiries", "loan_applications"):
        # This revision was exercised locally before the optional provider
        # preference fields landed. IF EXISTS keeps that pre-release database
        # state reversible as well as the final revision state.
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_preferred_provider_offer_id")
        op.execute(
            f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_preferred_provider_offer_id"
        )
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS provider_offer_snapshot")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS preferred_provider_offer_id")

    op.execute("DROP POLICY IF EXISTS provider_offers_update ON financial_product_provider_offers")
    op.execute("DROP POLICY IF EXISTS provider_offers_insert ON financial_product_provider_offers")
    op.execute("DROP POLICY IF EXISTS provider_offers_select ON financial_product_provider_offers")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON financial_product_provider_offers FROM api_user")
    op.drop_index("ix_provider_offers_bank_id", table_name="financial_product_provider_offers")
    op.drop_index(
        "ix_provider_offers_product_public_order",
        table_name="financial_product_provider_offers",
    )
    op.drop_table("financial_product_provider_offers")

    op.execute(
        "REVOKE UPDATE (legal_name, provider_type, logo_source, logo_verified_at) "
        "ON banks FROM api_user"
    )
    op.drop_constraint("ck_banks_provider_type", "banks", type_="check")
    op.drop_column("banks", "logo_verified_at")
    op.drop_column("banks", "logo_source")
    op.drop_column("banks", "provider_type")
    op.drop_column("banks", "legal_name")

    op.execute(
        "REVOKE UPDATE (public_visible, public_summary, public_description, "
        "public_highlights, public_eligibility, public_documents, public_faq, "
        "homepage_featured, homepage_feature_order) ON loan_types FROM api_user"
    )
    op.drop_constraint("ck_loan_types_homepage_feature_order", "loan_types", type_="check")
    op.drop_constraint("ck_loan_types_homepage_featured_is_public", "loan_types", type_="check")
    op.drop_column("loan_types", "homepage_feature_order")
    op.drop_column("loan_types", "homepage_featured")
    for column in reversed(
        ("public_highlights", "public_eligibility", "public_documents", "public_faq")
    ):
        op.drop_constraint(f"ck_loan_types_{column}_array", "loan_types", type_="check")
        op.drop_column("loan_types", column)
    op.drop_column("loan_types", "public_description")
    op.drop_column("loan_types", "public_summary")
    op.drop_column("loan_types", "public_visible")
