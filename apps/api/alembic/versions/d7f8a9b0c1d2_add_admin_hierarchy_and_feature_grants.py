"""add Main Admin hierarchy and closed Sub Admin feature grants

Revision ID: d7f8a9b0c1d2
Revises: c5d6e7f8a9b0
Create Date: 2026-08-10 00:00:00.000000

The oldest active platform Admin becomes the single Main Admin. Clean installs
have no Admin until the deployment seed creates one explicitly. Feature grants are
row-level protected: a Sub Admin can read only their own grants, while only the
Main Admin can grant or revoke them.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d7f8a9b0c1d2"
down_revision: str | Sequence[str] | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_PRIMARY_ADMIN = """
EXISTS (
    SELECT 1
    FROM public.staff_profiles AS actor
    WHERE actor.id::text = current_setting('app.staff_profile_uuid', true)
      AND actor.auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
      AND actor.role::text = 'admin'
      AND actor.scope::text = 'platform'
      AND actor.status::text = 'active'
      AND actor.is_primary_admin = true
)
"""


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'staff_feature_granted'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'staff_feature_revoked'")
    op.add_column(
        "staff_profiles",
        sa.Column(
            "is_primary_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_check_constraint(
        "staff_profiles_primary_admin_role",
        "staff_profiles",
        "NOT is_primary_admin OR (role::text = 'admin' AND scope::text = 'platform' "
        "AND status::text = 'active')",
    )
    op.create_index(
        "uq_staff_profiles_one_primary_admin",
        "staff_profiles",
        ["is_primary_admin"],
        unique=True,
        postgresql_where=sa.text("is_primary_admin"),
    )
    op.execute(
        """
        UPDATE public.staff_profiles
        SET is_primary_admin = true
        WHERE id = (
            SELECT id
            FROM public.staff_profiles
            WHERE role::text = 'admin'
              AND scope::text = 'platform'
              AND status::text = 'active'
            ORDER BY created_at ASC, id ASC
            LIMIT 1
        )
        """
    )

    op.create_table(
        "staff_feature_grants",
        sa.Column("staff_profile_uuid", sa.UUID(), nullable=False),
        sa.Column("feature", sa.String(length=64), nullable=False),
        sa.Column("granted_by_auth_user_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "feature IN ('payout_requests')",
            name=op.f("ck_staff_feature_grants_feature_supported"),
        ),
        sa.ForeignKeyConstraint(
            ["staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_staff_feature_grants_staff_profile_uuid_staff_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["granted_by_auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_staff_feature_grants_granted_by_auth_user_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "staff_profile_uuid",
            "feature",
            name=op.f("pk_staff_feature_grants"),
        ),
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON staff_feature_grants TO api_user")
    op.execute("ALTER TABLE staff_feature_grants ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY staff_feature_grants_select ON staff_feature_grants
        FOR SELECT
        USING (
            staff_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
            OR {_PRIMARY_ADMIN}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY staff_feature_grants_insert ON staff_feature_grants
        FOR INSERT
        WITH CHECK (
            {_PRIMARY_ADMIN}
            AND EXISTS (
                SELECT 1
                FROM public.staff_profiles AS target
                WHERE target.id = staff_profile_uuid
                  AND target.role::text = 'sub_admin'
                  AND target.scope::text = 'platform'
                  AND target.status::text = 'active'
            )
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY staff_feature_grants_delete ON staff_feature_grants
        FOR DELETE
        USING ({_PRIMARY_ADMIN})
        """
    )
    op.execute("DROP POLICY payouts_rls ON payouts")
    op.execute(
        """
        CREATE POLICY payouts_rls ON payouts
        FOR ALL
        USING (
            (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'admin'
            )
            OR (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'sub_admin'
                AND current_setting('app.staff_features', true) = 'payout_requests'
            )
        )
        WITH CHECK (
            (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'admin'
            )
            OR (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'sub_admin'
                AND current_setting('app.staff_features', true) = 'payout_requests'
            )
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS payouts_rls ON payouts")
    op.execute(
        """
        CREATE POLICY payouts_rls ON payouts
        FOR ALL
        USING (
            (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'admin'
            )
            OR (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'sub_admin'
            )
        )
        WITH CHECK (
            (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'admin'
            )
            OR (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'sub_admin'
            )
        )
        """
    )
    op.execute("DROP POLICY IF EXISTS staff_feature_grants_delete ON staff_feature_grants")
    op.execute("DROP POLICY IF EXISTS staff_feature_grants_insert ON staff_feature_grants")
    op.execute("DROP POLICY IF EXISTS staff_feature_grants_select ON staff_feature_grants")
    op.execute("ALTER TABLE staff_feature_grants DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, DELETE ON staff_feature_grants FROM api_user")
    op.drop_table("staff_feature_grants")
    op.drop_index("uq_staff_profiles_one_primary_admin", table_name="staff_profiles")
    op.drop_constraint(
        op.f("ck_staff_profiles_staff_profiles_primary_admin_role"),
        "staff_profiles",
        type_="check",
    )
    op.drop_column("staff_profiles", "is_primary_admin")
