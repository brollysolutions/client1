"""add task_documents table + RLS

Revision ID: b3c4d5e6f7a8
Revises: f3a4b5c6d7e8
Create Date: 2026-07-23 11:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004).

Employee_Dashboard_System_Design.md §5.2 / master_erd.mermaid:426-436. One row
per file collected during a document_collection task, uploaded via a presigned
storage URL (services/storage.py) obtained from the employee API. `doc_type`
and `object_key` stay free TEXT per the ERD; the fixed doc-type vocabulary is
an API-layer contract (schemas/employee.py), not a DB constraint.

`verified`/`verified_by_profile_uuid`/`verified_at` are written by a later
Admin-side slice (design doc: Admin, not the collecting employee) — created
now so that slice extends this table rather than re-migrating it, same
posture as tasks.property_visit/background_check in migration b2c3d4e5f6a7.

RLS: reachable only via the owning task (EXISTS join on tasks), scoped to the
task's assigned employee specifically (not the raiser — document collection
is the assigned employee's own work; the raising telecaller has no read
access to what was collected, matching FR-2.6 least-privilege), plus the
platform_scope Admin bypass. GRANT SELECT/INSERT/DELETE only: no UPDATE yet
because nothing in this slice mutates an existing row (the Admin verify slice
will need to add UPDATE later, additive).

Rollback: drop policy, disable RLS, revoke grant, drop index, drop table.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | Sequence[str] | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = task_documents.task_uuid
        AND current_setting('app.staff_profile_uuid', true) <> ''
        AND t.business_line::text = current_setting('app.business_line', true)
        AND t.assigned_employee_profile_uuid IS NOT NULL
        AND t.assigned_employee_profile_uuid::text
            = current_setting('app.staff_profile_uuid', true)
    )
"""


def upgrade() -> None:
    op.create_table(
        "task_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("task_uuid", sa.UUID(), nullable=False),
        sa.Column("doc_type", sa.Text(), nullable=False),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified_by_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["task_uuid"],
            ["tasks.id"],
            name=op.f("fk_task_documents_task_uuid_tasks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_task_documents_verified_by_profile_uuid_staff_profiles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_task_documents")),
    )
    op.create_index(op.f("ix_task_documents_task_uuid"), "task_documents", ["task_uuid"])

    op.execute("GRANT SELECT, INSERT, DELETE ON task_documents TO api_user")
    op.execute("ALTER TABLE task_documents ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY task_documents_rls ON task_documents
        FOR ALL
        USING ({_PREDICATE})
        WITH CHECK ({_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS task_documents_rls ON task_documents")
    op.execute("ALTER TABLE task_documents DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, DELETE ON task_documents FROM api_user")
    op.drop_index(op.f("ix_task_documents_task_uuid"), table_name="task_documents")
    op.drop_table("task_documents")
