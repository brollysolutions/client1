"""persist round-robin Telecaller assignment cursors

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-10 00:00:00.000000

The cursor is internal scheduler/service state.  ``api_user`` receives no
privileges or RLS policy; only the existing bypass-session automatic assignment
paths can read or advance it.  The latest valid automatic assignment is used to
continue each line's rotation across deployment.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: str | Sequence[str] | None = "a3b4c5d6e7f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VALIDATE_CURSOR_FN = "validate_lead_assignment_cursor"


def upgrade() -> None:
    op.create_table(
        "lead_assignment_cursors",
        sa.Column(
            "business_line",
            postgresql.ENUM(name="business_line_enum", create_type=False),
            nullable=False,
        ),
        sa.Column("last_telecaller_profile_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "business_line::text IN ('loans', 'real_estate')",
            name=op.f("ck_lead_assignment_cursors_business_line_operational"),
        ),
        sa.ForeignKeyConstraint(
            ["last_telecaller_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_lead_assignment_cursors_last_telecaller_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "business_line",
            name=op.f("pk_lead_assignment_cursors"),
        ),
    )
    op.execute("ALTER TABLE lead_assignment_cursors ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE lead_assignment_cursors FORCE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE lead_assignment_cursors FROM PUBLIC")
    op.execute("REVOKE ALL ON TABLE lead_assignment_cursors FROM api_user")

    op.execute(
        f"""
        CREATE FUNCTION {_VALIDATE_CURSOR_FN}() RETURNS trigger AS $$
        BEGIN
            IF NEW.last_telecaller_profile_uuid IS NOT NULL AND NOT EXISTS (
                SELECT 1
                FROM public.staff_profiles staff
                WHERE staff.id = NEW.last_telecaller_profile_uuid
                  AND staff.role::text = 'telecaller'
                  AND staff.business_line = NEW.business_line
            ) THEN
                RAISE EXCEPTION 'assignment cursor must reference a same-line telecaller'
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;
        """
    )
    op.execute(f"REVOKE ALL ON FUNCTION {_VALIDATE_CURSOR_FN}() FROM PUBLIC")
    op.execute(
        f"CREATE TRIGGER trg_validate_lead_assignment_cursor "
        f"BEFORE INSERT OR UPDATE OF business_line, last_telecaller_profile_uuid "
        f"ON lead_assignment_cursors FOR EACH ROW EXECUTE FUNCTION {_VALIDATE_CURSOR_FN}()"
    )
    op.execute(
        "CREATE TRIGGER trg_lead_assignment_cursors_business_line_immutable "
        "BEFORE UPDATE ON lead_assignment_cursors FOR EACH ROW "
        "EXECUTE FUNCTION enforce_business_line_immutable()"
    )

    op.execute(
        """
        INSERT INTO lead_assignment_cursors (
            business_line,
            last_telecaller_profile_uuid
        )
        SELECT line.business_line::business_line_enum, latest.telecaller_uuid
        FROM (VALUES ('loans'), ('real_estate')) AS line(business_line)
        LEFT JOIN LATERAL (
            SELECT staff.id AS telecaller_uuid
            FROM audit_log audit
            JOIN staff_profiles staff
              ON staff.id = (audit.detail ->> 'telecaller_staff_profile_uuid')::uuid
             AND staff.role::text = 'telecaller'
             AND staff.business_line::text = line.business_line
            WHERE audit.action::text = 'lead_assigned'
              AND audit.actor_uuid IS NULL
              AND audit.business_line::text = line.business_line
              AND audit.detail ->> 'mode' = 'automatic'
            ORDER BY audit.created_at DESC, audit.id DESC
            LIMIT 1
        ) latest ON TRUE
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_lead_assignment_cursors_business_line_immutable "
        "ON lead_assignment_cursors"
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trg_validate_lead_assignment_cursor ON lead_assignment_cursors"
    )
    op.execute(f"DROP FUNCTION IF EXISTS {_VALIDATE_CURSOR_FN}()")
    op.drop_table("lead_assignment_cursors")
