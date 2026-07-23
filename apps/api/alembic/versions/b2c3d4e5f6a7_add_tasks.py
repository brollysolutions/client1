"""add tasks table + enums + RLS

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-23 09:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy + trigger require a direct connection — ADR-0004).

tasks is the field-task assignment spine (Telecaller_Dashboard_System_Design.md
Open Item A, decided yes this slice; Employee_Dashboard_System_Design.md §5.1).
This slice only exercises task_type='document_collection', raised by a
telecaller against one of their own assigned leads, landing in an unassigned
pool for Admin to hand to a line-scoped employee — the full task_type enum
(including property_visit, background_check) is created now so a later
Employee-dashboard slice extends this table instead of re-migrating it.

Deviation from the Employee doc's lifecycle (which starts at 'assigned'):
task_status gains a leading 'unassigned' state for the pool model. lead_uuid is
NOT NULL this slice — every task originates from an assigned lead context.

GRANT SELECT, INSERT, UPDATE (not DELETE): UPDATE is needed for the admin
assign step (services/tasks.py::assign_task_to_employee) and is deliberately
broader than this slice's endpoints use — RLS's own-rows predicate (raised-by
self OR assigned-employee self) still applies to any future write path that
uses it, and test_tasks_rls.py documents/covers this surface explicitly rather
than leaving it an accidental capability.

Rollback: drop policy, disable RLS, revoke grant, drop trigger, drop indexes,
drop table, drop both enums.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"

_TASK_TYPE_VALUES = ("document_collection", "property_visit", "background_check")
_TASK_STATUS_VALUES = (
    "unassigned",
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
    "blocked",
)

_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND (
            raised_by_staff_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
            OR (
                assigned_employee_profile_uuid IS NOT NULL
                AND assigned_employee_profile_uuid::text
                    = current_setting('app.staff_profile_uuid', true)
            )
        )
    )
"""


def upgrade() -> None:
    bind = op.get_bind()

    task_type = postgresql.ENUM(*_TASK_TYPE_VALUES, name="task_type")
    task_type.create(bind)
    task_status = postgresql.ENUM(*_TASK_STATUS_VALUES, name="task_status")
    task_status.create(bind)

    op.create_table(
        "tasks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("assigned_employee_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("raised_by_staff_profile_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "task_type",
            postgresql.ENUM(*_TASK_TYPE_VALUES, name="task_type", create_type=False),
            nullable=False,
        ),
        sa.Column("lead_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(*_TASK_STATUS_VALUES, name="task_status", create_type=False),
            nullable=False,
            server_default="unassigned",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["assigned_employee_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_tasks_assigned_employee_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["raised_by_staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_tasks_raised_by_staff_profile_uuid_staff_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["lead_uuid"],
            ["leads.id"],
            name=op.f("fk_tasks_lead_uuid_leads"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tasks")),
    )
    op.create_index(op.f("ix_tasks_lead_uuid"), "tasks", ["lead_uuid"])
    op.create_index(
        op.f("ix_tasks_raised_by_staff_profile_uuid"), "tasks", ["raised_by_staff_profile_uuid"]
    )
    op.create_index(
        op.f("ix_tasks_assigned_employee_profile_uuid"),
        "tasks",
        ["assigned_employee_profile_uuid"],
    )
    op.create_index(op.f("ix_tasks_status"), "tasks", ["status"])

    op.execute(
        f"CREATE TRIGGER trg_tasks_business_line_immutable "
        f"BEFORE UPDATE ON tasks "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE ON tasks TO api_user")
    op.execute("ALTER TABLE tasks ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY tasks_rls ON tasks
        FOR ALL
        USING ({_PREDICATE})
        WITH CHECK ({_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tasks_rls ON tasks")
    op.execute("ALTER TABLE tasks DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON tasks FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_tasks_business_line_immutable ON tasks")
    op.drop_index(op.f("ix_tasks_status"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_assigned_employee_profile_uuid"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_raised_by_staff_profile_uuid"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_lead_uuid"), table_name="tasks")
    op.drop_table("tasks")
    postgresql.ENUM(name="task_status").drop(op.get_bind())
    postgresql.ENUM(name="task_type").drop(op.get_bind())
