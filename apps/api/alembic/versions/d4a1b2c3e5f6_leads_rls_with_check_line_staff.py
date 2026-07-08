"""leads_rls: allow line staff to WRITE leads in their own business_line

Revision ID: d4a1b2c3e5f6
Revises: c7d8e9f0a1b2
Create Date: 2026-07-08 00:00:00.000000

Audit finding D1. The original leads_rls (migration 8b2d3c4e5f6a) let line
telecaller/employee/sub_admin SELECT leads in their business_line (USING has the
line-staff branch) but its WITH CHECK only passed for platform_scope='true' OR the
owning client. Because an UPDATE re-checks the NEW row against WITH CHECK, a line
telecaller could not progress a lead they legitimately own (new -> working ->
converted, assign themselves, etc.) — every write raised a row-security violation,
which kills the core CRM workflow ("Telecallers work this table").

Fix: recreate the policy with WITH CHECK mirroring the USING line-staff predicate,
so a lead write is permitted when the row's business_line matches the actor's
app.business_line and the actor is line staff. This also pins the line: the NEW
row's business_line must still equal the actor's line, so a line write cannot move
a lead across the loans/real_estate boundary.

FOR ALL / DROP + CREATE POLICY only — no table DDL, enum, or GRANT changes, so it
runs fine through pgBouncer.

Rollback: downgrade restores the previous (line-staff-write-blocking) WITH CHECK.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4a1b2c3e5f6"
down_revision: str | Sequence[str] | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Shared USING predicate — identical in both the fixed and the original policy.
_USING = """
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

# Old WITH CHECK — platform bypass or owning client only (blocks line-staff writes).
_WITH_CHECK_OLD = """
    current_setting('app.platform_scope', true) = 'true'
    OR (
        client_profile_uuid IS NOT NULL
        AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    )
"""


def _recreate_policy(with_check: str) -> None:
    op.execute("DROP POLICY IF EXISTS leads_rls ON leads")
    op.execute(
        f"""
        CREATE POLICY leads_rls ON leads
        FOR ALL
        USING ({_USING})
        WITH CHECK ({with_check});
        """
    )


def upgrade() -> None:
    # Fixed WITH CHECK = full USING predicate (adds the line-staff write branch).
    _recreate_policy(_USING)


def downgrade() -> None:
    _recreate_policy(_WITH_CHECK_OLD)
