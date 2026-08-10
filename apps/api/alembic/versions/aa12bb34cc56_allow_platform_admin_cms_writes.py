"""Allow platform Admin operational CMS overrides.

Revision ID: aa12bb34cc56
Revises: d7f8a9b0c1d2
Create Date: 2026-08-10
"""

from alembic import op

revision = "aa12bb34cc56"
down_revision = "d7f8a9b0c1d2"
branch_labels = None
depends_on = None


_PLATFORM_ADMIN = """
    current_setting('app.role', true) = 'admin'
    AND current_setting('app.platform_scope', true) = 'true'
"""


def upgrade() -> None:
    # These policies retain Sub Admin's owner-only authoring path while adding
    # the same full-platform Admin predicate used elsewhere in the RLS suite.
    # The immutable business-line triggers and application status machines stay
    # authoritative; this migration does not grant DELETE or bypass them.
    for table in ("banners", "offers", "content_blocks", "referral_bonus_config"):
        op.execute(f"DROP POLICY IF EXISTS {table}_insert ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_update ON {table}")

    op.execute(
        f"""
        CREATE POLICY banners_insert ON banners FOR INSERT
        WITH CHECK (
            (current_setting('app.role', true) = 'sub_admin'
             AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
             AND status::text = 'draft')
            OR (
                {_PLATFORM_ADMIN}
                AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
                AND status::text = 'draft')
        );
        CREATE POLICY banners_update ON banners FOR UPDATE
        USING (
            (current_setting('app.role', true) = 'sub_admin'
             AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
             AND status::text IN ('draft', 'rejected'))
            OR ({_PLATFORM_ADMIN} AND status::text IN ('draft', 'rejected'))
        )
        WITH CHECK (
            (current_setting('app.role', true) = 'sub_admin'
             AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
             AND status::text IN ('draft', 'pending_approval', 'rejected'))
            OR ({_PLATFORM_ADMIN} AND status::text IN ('draft', 'pending_approval', 'rejected'))
        );
        """
    )

    for table in ("offers", "content_blocks", "referral_bonus_config"):
        op.execute(
            f"""
            CREATE POLICY {table}_insert ON {table} FOR INSERT
            WITH CHECK (
                (current_setting('app.role', true) = 'sub_admin'
                 AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
                OR ({_PLATFORM_ADMIN}
                    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
            );
            CREATE POLICY {table}_update ON {table} FOR UPDATE
            USING (
                (current_setting('app.role', true) = 'sub_admin'
                 AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
                OR ({_PLATFORM_ADMIN})
            )
            WITH CHECK (
                (current_setting('app.role', true) = 'sub_admin'
                 AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
                OR ({_PLATFORM_ADMIN})
            );
            """
        )


def downgrade() -> None:
    for table in ("banners", "offers", "content_blocks", "referral_bonus_config"):
        op.execute(f"DROP POLICY IF EXISTS {table}_insert ON {table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_update ON {table}")

    op.execute(
        """
        CREATE POLICY banners_insert ON banners FOR INSERT WITH CHECK (
            current_setting('app.role', true) = 'sub_admin'
            AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
            AND status::text = 'draft'
        );
        CREATE POLICY banners_update ON banners FOR UPDATE
        USING (
            current_setting('app.role', true) = 'sub_admin'
            AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
            AND status::text IN ('draft', 'rejected')
        )
        WITH CHECK (
            created_by_uuid::text = current_setting('app.auth_user_uuid', true)
            AND status::text IN ('draft', 'pending_approval', 'rejected')
        );
        """
    )
    for table in ("offers", "content_blocks", "referral_bonus_config"):
        op.execute(
            f"""
            CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK (
                current_setting('app.role', true) = 'sub_admin'
                AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
            );
            CREATE POLICY {table}_update ON {table} FOR UPDATE
            USING (
                current_setting('app.role', true) = 'sub_admin'
                AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
            )
            WITH CHECK (created_by_uuid::text = current_setting('app.auth_user_uuid', true));
            """
        )
