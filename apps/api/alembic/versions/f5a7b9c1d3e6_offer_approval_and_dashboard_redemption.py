"""make offers reviewed dashboard-only partner campaigns

Revision ID: f5a7b9c1d3e6
Revises: e4f6a8c0d2b5
Create Date: 2026-08-28 19:00:00.000000

Existing scheduled and active rows predate the approval evidence and required
redemption fields introduced here. They are returned to draft instead of being
silently grandfathered into the authenticated dashboards.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f5a7b9c1d3e6"
down_revision: str | Sequence[str] | None = "e4f6a8c0d2b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in ("pending_approval", "approved", "rejected"):
            op.execute(f"ALTER TYPE offer_status ADD VALUE IF NOT EXISTS '{value}'")
        for value in (
            "offer_created",
            "offer_updated",
            "offer_submitted",
            "offer_approved",
            "offer_rejected",
            "offer_scheduled",
            "offer_activated",
            "offer_expired",
            "offer_archived",
        ):
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")

    op.add_column("offers", sa.Column("partner_name", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("redemption_url", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("terms_summary", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("terms_url", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("image_key", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("review_note", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("reviewed_by_uuid", sa.UUID(), nullable=True))
    op.add_column("offers", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_offers_reviewed_by_uuid_auth_users"),
        "offers",
        "auth_users",
        ["reviewed_by_uuid"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        "UPDATE offers SET status = 'draft', review_note = "
        "'Complete the partner, artwork, terms, audience, and approval details "
        "before resubmitting.' "
        "WHERE status::text IN ('scheduled', 'active')"
    )

    # Re-pin creation to the content owner and the initial draft state.  An
    # older platform-scope widening of this policy allowed Admin inserts and
    # omitted the status guard; the reviewed workflow creates campaigns only
    # through Sub Admin and reserves Admin for approval decisions.
    op.execute("DROP POLICY IF EXISTS offers_insert ON offers")
    op.execute(
        """
        CREATE POLICY offers_insert ON offers
        FOR INSERT
        WITH CHECK (
            current_setting('app.role', true) = 'sub_admin'
            AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
            AND status::text = 'draft'
        )
        """
    )

    op.execute("DROP POLICY IF EXISTS offers_update ON offers")
    op.execute(
        """
        CREATE POLICY offers_update ON offers
        FOR UPDATE
        USING (
            (current_setting('app.role', true) = 'sub_admin'
             AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
            OR
            (current_setting('app.role', true) = 'admin'
             AND current_setting('app.platform_scope', true) = 'true')
        )
        WITH CHECK (
            (current_setting('app.role', true) = 'sub_admin'
             AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
            OR
            (current_setting('app.role', true) = 'admin'
             AND current_setting('app.platform_scope', true) = 'true')
        )
        """
    )


def downgrade() -> None:
    # Old application code cannot deserialize the new workflow states even
    # though PostgreSQL enum labels are intentionally retained below.
    op.execute(
        "UPDATE offers SET status = 'draft' "
        "WHERE status::text IN ('pending_approval', 'approved', 'rejected')"
    )
    op.execute("DROP POLICY IF EXISTS offers_insert ON offers")
    op.execute(
        """
        CREATE POLICY offers_insert ON offers
        FOR INSERT
        WITH CHECK (
            current_setting('app.role', true) = 'sub_admin'
            AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
            AND status::text = 'draft'
        )
        """
    )
    op.execute("DROP POLICY IF EXISTS offers_update ON offers")
    op.execute(
        """
        CREATE POLICY offers_update ON offers
        FOR UPDATE
        USING (
            current_setting('app.role', true) = 'sub_admin'
            AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        )
        WITH CHECK (
            created_by_uuid::text = current_setting('app.auth_user_uuid', true)
        )
        """
    )
    op.drop_constraint(op.f("fk_offers_reviewed_by_uuid_auth_users"), "offers", type_="foreignkey")
    for column in (
        "reviewed_at",
        "reviewed_by_uuid",
        "review_note",
        "image_key",
        "terms_url",
        "terms_summary",
        "redemption_url",
        "partner_name",
    ):
        op.drop_column("offers", column)
    # PostgreSQL enum labels are retained: removing labels requires rebuilding
    # dependent tables and risks historical audit/status rows.
