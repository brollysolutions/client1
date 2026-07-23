"""leads_rls: narrow the telecaller branch to only their own assigned leads

Revision ID: e6c7b8f9a0d1
Revises: d5b6c7a8f9e0
Create Date: 2026-07-22 12:05:00.000000

The original leads_rls (migration 8b2d3c4e5f6a, WITH CHECK fixed by d4a1b2c3e5f6)
grants any telecaller/employee/sub_admin on a business line access to EVERY lead
on that line. That's correct for employee/sub_admin (unchanged here), but the
Telecaller Dashboard design (docs/architecture/Telecaller_Dashboard_System_Design.md
§7) scopes a telecaller to only their own assigned leads — an unassigned lead or
another telecaller's lead must be invisible. This splits the old combined
line-staff branch into two: employee/sub_admin keep whole-line access, telecaller
is narrowed to `assigned_telecaller_profile_uuid = self`.

USING = WITH CHECK on the new telecaller branch too (the D1 lesson from
d4a1b2c3e5f6: an asymmetric WITH CHECK blocks writes for the role it's supposed
to allow).

FOR ALL / DROP + CREATE POLICY + one plain CREATE INDEX only — no enum or GRANT
DDL, so it runs fine through pgBouncer.

Rollback: downgrade restores the pre-existing broad telecaller branch and drops
the index.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e6c7b8f9a0d1"
down_revision: str | Sequence[str] | None = "d5b6c7a8f9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREDICATE_NEW = """
    current_setting('app.platform_scope', true) = 'true'
    OR (
        client_profile_uuid IS NOT NULL
        AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND assigned_telecaller_profile_uuid IS NOT NULL
        AND assigned_telecaller_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
    )
"""

# Pre-existing broad predicate (8b2d3c4e5f6a USING + d4a1b2c3e5f6 WITH CHECK) —
# restored on downgrade.
_PREDICATE_OLD = """
    current_setting('app.platform_scope', true) = 'true'
    OR (
        client_profile_uuid IS NOT NULL
        AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
    )
"""


def _recreate_policy(predicate: str) -> None:
    op.execute("DROP POLICY IF EXISTS leads_rls ON leads")
    op.execute(
        f"""
        CREATE POLICY leads_rls ON leads
        FOR ALL
        USING ({predicate})
        WITH CHECK ({predicate});
        """
    )


def upgrade() -> None:
    # Hot filter for both this RLS branch and the telecaller leads-list endpoint;
    # missing since the original leads migration (8b2d3c4e5f6a).
    op.create_index(
        "ix_leads_assigned_telecaller_profile_uuid", "leads", ["assigned_telecaller_profile_uuid"]
    )
    _recreate_policy(_PREDICATE_NEW)


def downgrade() -> None:
    _recreate_policy(_PREDICATE_OLD)
    op.drop_index("ix_leads_assigned_telecaller_profile_uuid", table_name="leads")
