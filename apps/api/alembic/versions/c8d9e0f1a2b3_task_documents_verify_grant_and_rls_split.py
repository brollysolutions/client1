"""task_documents verify grant + RLS policy split (FR-7.4) — SECURITY CRITICAL

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-07-29 12:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004).

`task_documents.verified`/`verified_by_profile_uuid`/`verified_at` have
existed since the employee-collection slice (b3c4d5e6f7a8) with NO writer —
that migration deliberately granted only `SELECT, INSERT, DELETE`, with its
own docstring anticipating "the Admin verify slice will need to add UPDATE
later, additive."

*** Doing only that (a bare GRANT UPDATE) would be UNSAFE. ***

`task_documents_rls` (as widened by a0b1c2d3e4f5) is a single `FOR ALL`
policy whose USING **and** WITH CHECK both admit the task's ASSIGNED
EMPLOYEE, not just Admin:

    (platform_scope='true' AND role='admin')
    OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_documents.task_uuid
               AND staff_profile_uuid <> ''
               AND t.business_line = app.business_line
               AND t.assigned_employee_profile_uuid = app.staff_profile_uuid)

Granting UPDATE onto a single FOR ALL policy would hand the COLLECTING
EMPLOYEE the ability to mark their own uploaded documents verified —
directly contradicting FR-7.4 ("Admin verifies internal completeness") and
`Employee_Dashboard_System_Design.md`'s explicit statement that verification
"is an Admin/Telecaller step downstream — the employee collects, they do not
adjudicate" (FR-2.6). This migration is the fix: split the single policy
into four per-command policies, with `task_documents_update` admin-only.
`task_documents_select`/`_insert`/`_delete` keep the EXACT byte-identical
predicate task_documents_rls already had (verified against the live
database before writing this migration) — nothing changes for the employee
collection/list/delete flow.

`review_note` is added now (write-once-per-unverify companion to `verified`,
same shape `fee_cashbacks.cancelled_reason` and
`support_tickets.resolution_note` use): a tri-state enum would be a schema
change to a shipped table for a distinction the spec doesn't draw — the
codebase's "rejected" is `verified=false` + a non-null note, `verified=true`
+ null note is silence-implies-accepted, matching how commissions/referrals
treat a null `cancelled_reason`.

The column-scoped `GRANT UPDATE (verified, verified_by_profile_uuid,
verified_at, review_note)` mirrors migration f5a6b7c8d9e0's identical grant
on `loan_documents` for the same table — see that migration's docstring for
the `875b08101bea` column-scoped-grant-plus-`onupdate` trap this table also
avoids (`task_documents` has no `updated_at`, unchanged by this migration).

Rollback: drop the four split policies, restore the original single FOR ALL
policy (byte-identical predicate), revoke the column-scoped grant, drop
`review_note`.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Byte-identical to the live task_documents_rls predicate (verified via
# `pg_get_expr(polqual, polrelid)` against the running database before this
# migration was written — not re-derived from the source migration by hand).
_PREDICATE = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
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

_ADMIN_ONLY_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""


def upgrade() -> None:
    op.execute("ALTER TABLE task_documents ADD COLUMN review_note TEXT NULL")

    op.execute(
        "GRANT UPDATE (verified, verified_by_profile_uuid, verified_at, review_note) "
        "ON task_documents TO api_user"
    )

    # The grant above is unsafe without this split — see module docstring.
    op.execute("DROP POLICY IF EXISTS task_documents_rls ON task_documents")

    op.execute(
        f"""
        CREATE POLICY task_documents_select ON task_documents
        FOR SELECT
        USING ({_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY task_documents_insert ON task_documents
        FOR INSERT
        WITH CHECK ({_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY task_documents_delete ON task_documents
        FOR DELETE
        USING ({_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY task_documents_update ON task_documents
        FOR UPDATE
        USING ({_ADMIN_ONLY_PREDICATE})
        WITH CHECK ({_ADMIN_ONLY_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS task_documents_update ON task_documents")
    op.execute("DROP POLICY IF EXISTS task_documents_delete ON task_documents")
    op.execute("DROP POLICY IF EXISTS task_documents_insert ON task_documents")
    op.execute("DROP POLICY IF EXISTS task_documents_select ON task_documents")
    op.execute(
        f"""
        CREATE POLICY task_documents_rls ON task_documents
        FOR ALL
        USING ({_PREDICATE})
        WITH CHECK ({_PREDICATE});
        """
    )
    op.execute(
        "REVOKE UPDATE (verified, verified_by_profile_uuid, verified_at, review_note) "
        "ON task_documents FROM api_user"
    )
    op.execute("ALTER TABLE task_documents DROP COLUMN review_note")
