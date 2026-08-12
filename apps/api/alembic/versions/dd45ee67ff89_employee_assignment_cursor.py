"""add durable automatic Employee assignment cursor

Revision ID: dd45ee67ff89
Revises: cc34dd56ee78
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "dd45ee67ff89"
down_revision: str | Sequence[str] | None = "cc34dd56ee78"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VALIDATE_CURSOR_FN = "validate_employee_assignment_cursor"


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'employee_work_assigned'")
    op.create_table(
        "employee_assignment_cursors",
        sa.Column(
            "business_line",
            postgresql.ENUM(name="business_line_enum", create_type=False),
            nullable=False,
        ),
        sa.Column("last_employee_profile_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "business_line::text IN ('loans', 'real_estate')",
            name=op.f("ck_employee_assignment_cursors_business_line_operational"),
        ),
        sa.ForeignKeyConstraint(
            ["last_employee_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_employee_assignment_cursors_last_employee_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("business_line", name=op.f("pk_employee_assignment_cursors")),
    )
    op.execute("ALTER TABLE employee_assignment_cursors ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE employee_assignment_cursors FORCE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE employee_assignment_cursors FROM PUBLIC")
    op.execute("REVOKE ALL ON TABLE employee_assignment_cursors FROM api_user")
    op.execute(
        f"""
        CREATE FUNCTION {_VALIDATE_CURSOR_FN}() RETURNS trigger AS $$
        BEGIN
            IF NEW.last_employee_profile_uuid IS NOT NULL AND NOT EXISTS (
                SELECT 1
                FROM public.staff_profiles staff
                WHERE staff.id = NEW.last_employee_profile_uuid
                  AND staff.role::text = 'employee'
                  AND staff.status::text = 'active'
                  AND staff.business_line::text IN (NEW.business_line::text, 'both')
            ) THEN
                RAISE EXCEPTION 'assignment cursor must reference an eligible Employee'
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;
        """
    )
    op.execute(f"REVOKE ALL ON FUNCTION {_VALIDATE_CURSOR_FN}() FROM PUBLIC")
    op.execute(
        f"CREATE TRIGGER trg_validate_employee_assignment_cursor "
        f"BEFORE INSERT OR UPDATE OF business_line, last_employee_profile_uuid "
        f"ON employee_assignment_cursors FOR EACH ROW EXECUTE FUNCTION {_VALIDATE_CURSOR_FN}()"
    )
    op.execute(
        "CREATE TRIGGER trg_employee_assignment_cursors_business_line_immutable "
        "BEFORE UPDATE ON employee_assignment_cursors FOR EACH ROW "
        "EXECUTE FUNCTION enforce_business_line_immutable()"
    )
    op.execute(
        "INSERT INTO employee_assignment_cursors (business_line) VALUES ('loans'), ('real_estate')"
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_employee_assignment_cursors_business_line_immutable "
        "ON employee_assignment_cursors"
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trg_validate_employee_assignment_cursor "
        "ON employee_assignment_cursors"
    )
    op.execute(f"DROP FUNCTION IF EXISTS {_VALIDATE_CURSOR_FN}()")
    op.drop_table("employee_assignment_cursors")
    # PostgreSQL enum values cannot be removed safely.
