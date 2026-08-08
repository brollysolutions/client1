"""add authenticated personalization preferences and offer targeting

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-08-07 00:00:00.000000

The preference row is owner-readable/writable. A narrowly scoped, authorization-
checking SECURITY DEFINER function lets the existing account-deletion transaction
erase one target row without granting any staff role consent/location visibility.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OWNER = "auth_user_uuid::text = current_setting('app.auth_user_uuid', true)"


def upgrade() -> None:
    op.add_column(
        "offers",
        sa.Column(
            "audience_rules",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "offers",
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(op.f("ck_offers_priority_nonnegative"), "offers", "priority >= 0")

    op.create_table(
        "personalization_preferences",
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "personalization_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("personalization_consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("latitude_e2", sa.SmallInteger(), nullable=True),
        sa.Column("longitude_e2", sa.SmallInteger(), nullable=True),
        sa.Column("location_captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location_consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "latitude_e2 IS NULL OR latitude_e2 BETWEEN -9000 AND 9000",
            name=op.f("ck_personalization_preferences_latitude_bounds"),
        ),
        sa.CheckConstraint(
            "longitude_e2 IS NULL OR longitude_e2 BETWEEN -18000 AND 18000",
            name=op.f("ck_personalization_preferences_longitude_bounds"),
        ),
        sa.CheckConstraint(
            "(NOT personalization_enabled AND personalization_consented_at IS NULL) OR "
            "(personalization_enabled AND personalization_consented_at IS NOT NULL)",
            name=op.f("ck_personalization_preferences_personalization_consent_consistent"),
        ),
        sa.CheckConstraint(
            "personalization_enabled OR NOT location_enabled",
            name=op.f("ck_personalization_preferences_location_requires_personalization"),
        ),
        sa.CheckConstraint(
            "(NOT location_enabled AND latitude_e2 IS NULL AND longitude_e2 IS NULL "
            "AND location_captured_at IS NULL AND location_consented_at IS NULL) OR "
            "(location_enabled AND latitude_e2 IS NOT NULL AND longitude_e2 IS NOT NULL "
            "AND location_captured_at IS NOT NULL AND location_consented_at IS NOT NULL)",
            name=op.f("ck_personalization_preferences_location_consistent"),
        ),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_personalization_preferences_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("auth_user_uuid", name=op.f("pk_personalization_preferences")),
    )
    op.create_index(
        op.f("ix_personalization_preferences_location_captured_at"),
        "personalization_preferences",
        ["location_captured_at"],
    )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON personalization_preferences TO api_user")
    op.execute("ALTER TABLE personalization_preferences ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY personalization_preferences_select ON personalization_preferences "
        f"FOR SELECT USING ({_OWNER})"
    )
    op.execute(
        f"CREATE POLICY personalization_preferences_insert ON personalization_preferences "
        f"FOR INSERT WITH CHECK ({_OWNER})"
    )
    op.execute(
        f"CREATE POLICY personalization_preferences_update ON personalization_preferences "
        f"FOR UPDATE USING ({_OWNER}) WITH CHECK ({_OWNER})"
    )
    op.execute(
        "CREATE POLICY personalization_preferences_delete ON personalization_preferences "
        f"FOR DELETE USING ({_OWNER})"
    )
    op.execute(
        """
        CREATE FUNCTION erase_personalization_preference(target_auth_user_uuid uuid)
        RETURNS boolean
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE
            removed_count integer;
        BEGIN
            IF NOT (
                target_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
                OR (
                    current_setting('app.role', true) = 'admin'
                    AND current_setting('app.platform_scope', true) = 'true'
                )
            ) THEN
                RAISE EXCEPTION 'personalization preference deletion is not authorized'
                    USING ERRCODE = '42501';
            END IF;

            DELETE FROM public.personalization_preferences
            WHERE auth_user_uuid = target_auth_user_uuid;
            GET DIAGNOSTICS removed_count = ROW_COUNT;
            RETURN removed_count > 0;
        END;
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION erase_personalization_preference(uuid) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION erase_personalization_preference(uuid) TO api_user")


def downgrade() -> None:
    op.execute("REVOKE EXECUTE ON FUNCTION erase_personalization_preference(uuid) FROM api_user")
    op.execute("DROP FUNCTION IF EXISTS erase_personalization_preference(uuid)")
    op.execute(
        "DROP POLICY IF EXISTS personalization_preferences_delete ON personalization_preferences"
    )
    op.execute(
        "DROP POLICY IF EXISTS personalization_preferences_update ON personalization_preferences"
    )
    op.execute(
        "DROP POLICY IF EXISTS personalization_preferences_insert ON personalization_preferences"
    )
    op.execute(
        "DROP POLICY IF EXISTS personalization_preferences_select ON personalization_preferences"
    )
    op.execute("ALTER TABLE personalization_preferences DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON personalization_preferences FROM api_user")
    op.drop_index(
        op.f("ix_personalization_preferences_location_captured_at"),
        table_name="personalization_preferences",
    )
    op.drop_table("personalization_preferences")
    op.drop_constraint(op.f("ck_offers_priority_nonnegative"), "offers", type_="check")
    op.drop_column("offers", "priority")
    op.drop_column("offers", "audience_rules")
