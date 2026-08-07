"""add vehicle arrangements, RLS, audit and notification values

Revision ID: b8c9d0e1f2a3
Revises: a6b7c8d9e0f1
Create Date: 2026-08-07 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_VALUES = ("requested", "arranged", "assigned", "completed", "cancelled")
_ADMIN = """
    current_setting('app.role', true) = 'admin'
    AND current_setting('app.platform_scope', true) = 'true'
"""
_CLIENT_OWNS = """
    current_setting('app.role', true) = 'client'
    AND EXISTS (
        SELECT 1 FROM site_visits sv
        WHERE sv.id = site_visit_uuid
          AND sv.user_uuid::text = current_setting('app.auth_user_uuid', true)
          AND sv.business_line::text = 'real_estate'
    )
"""
_EMPLOYEE_OWNS = """
    current_setting('app.role', true) = 'employee'
    AND current_setting('app.business_line', true) = 'real_estate'
    AND assigned_employee_profile_uuid IS NOT NULL
    AND assigned_employee_profile_uuid::text
        = current_setting('app.staff_profile_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'vehicle_arrangement_updated'")
        op.execute(
            "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'vehicle_arrangement_updated'"
        )

    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="vehicle_arrangement_status")
    status_enum.create(bind)

    op.create_table(
        "vehicle_arrangements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("site_visit_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("pickup_location", sa.String(length=500), nullable=False),
        sa.Column("pickup_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="vehicle_arrangement_status", create_type=False),
            nullable=False,
            server_default="requested",
        ),
        sa.Column("vehicle_make_model", sa.String(length=160), nullable=True),
        sa.Column("vehicle_registration", sa.String(length=40), nullable=True),
        sa.Column("driver_name", sa.String(length=120), nullable=True),
        sa.Column("driver_mobile", sa.String(length=20), nullable=True),
        sa.Column("assigned_employee_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("arranged_by_staff_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
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
        sa.CheckConstraint(
            "business_line = 'real_estate'", name="ck_vehicle_arrangements_real_estate_only"
        ),
        sa.ForeignKeyConstraint(
            ["site_visit_uuid"],
            ["site_visits.id"],
            name=op.f("fk_vehicle_arrangements_site_visit_uuid_site_visits"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_employee_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_vehicle_arrangements_assigned_employee_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["arranged_by_staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_vehicle_arrangements_arranged_by_staff_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_arrangements")),
        sa.UniqueConstraint(
            "site_visit_uuid", name=op.f("uq_vehicle_arrangements_site_visit_uuid")
        ),
    )
    op.create_index(
        op.f("ix_vehicle_arrangements_assigned_employee_profile_uuid"),
        "vehicle_arrangements",
        ["assigned_employee_profile_uuid"],
    )
    op.create_index(op.f("ix_vehicle_arrangements_status"), "vehicle_arrangements", ["status"])
    op.create_index(
        op.f("ix_vehicle_arrangements_pickup_at"), "vehicle_arrangements", ["pickup_at"]
    )

    op.execute(
        "CREATE TRIGGER trg_vehicle_arrangements_business_line_immutable "
        "BEFORE UPDATE ON vehicle_arrangements FOR EACH ROW "
        "EXECUTE FUNCTION enforce_business_line_immutable()"
    )
    op.execute(
        """
        CREATE FUNCTION cancel_vehicle_arrangement_with_visit()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
            IF NEW.status::text = 'cancelled' AND OLD.status::text <> 'cancelled' THEN
                UPDATE vehicle_arrangements
                SET status = 'cancelled',
                    cancelled_at = COALESCE(cancelled_at, now()),
                    cancellation_reason = COALESCE(
                        cancellation_reason, 'Associated site visit cancelled'
                    ),
                    updated_at = now()
                WHERE site_visit_uuid = NEW.id
                  AND status::text NOT IN ('completed', 'cancelled');
            END IF;
            RETURN NEW;
        END;
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION cancel_vehicle_arrangement_with_visit() FROM PUBLIC")
    op.execute(
        "CREATE TRIGGER trg_site_visit_cancel_vehicle_arrangement "
        "AFTER UPDATE OF status ON site_visits FOR EACH ROW "
        "EXECUTE FUNCTION cancel_vehicle_arrangement_with_visit()"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE ON vehicle_arrangements TO api_user")
    op.execute("ALTER TABLE vehicle_arrangements ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY vehicle_arrangements_select ON vehicle_arrangements
        FOR SELECT USING (({_ADMIN}) OR ({_CLIENT_OWNS}) OR ({_EMPLOYEE_OWNS}))
        """
    )
    op.execute(
        f"""
        CREATE POLICY vehicle_arrangements_insert ON vehicle_arrangements
        FOR INSERT WITH CHECK (
            business_line::text = 'real_estate'
            AND (({_ADMIN}) OR ({_CLIENT_OWNS}))
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY vehicle_arrangements_update ON vehicle_arrangements
        FOR UPDATE
        USING (({_ADMIN}) OR ({_EMPLOYEE_OWNS}))
        WITH CHECK (
            business_line::text = 'real_estate'
            AND (({_ADMIN}) OR ({_EMPLOYEE_OWNS}))
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_site_visit_cancel_vehicle_arrangement ON site_visits")
    op.execute("DROP FUNCTION IF EXISTS cancel_vehicle_arrangement_with_visit()")
    op.execute("DROP POLICY IF EXISTS vehicle_arrangements_update ON vehicle_arrangements")
    op.execute("DROP POLICY IF EXISTS vehicle_arrangements_insert ON vehicle_arrangements")
    op.execute("DROP POLICY IF EXISTS vehicle_arrangements_select ON vehicle_arrangements")
    op.execute("ALTER TABLE vehicle_arrangements DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON vehicle_arrangements FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_vehicle_arrangements_business_line_immutable "
        "ON vehicle_arrangements"
    )
    op.drop_index(op.f("ix_vehicle_arrangements_pickup_at"), table_name="vehicle_arrangements")
    op.drop_index(op.f("ix_vehicle_arrangements_status"), table_name="vehicle_arrangements")
    op.drop_index(
        op.f("ix_vehicle_arrangements_assigned_employee_profile_uuid"),
        table_name="vehicle_arrangements",
    )
    op.drop_table("vehicle_arrangements")
    postgresql.ENUM(name="vehicle_arrangement_status").drop(op.get_bind())
