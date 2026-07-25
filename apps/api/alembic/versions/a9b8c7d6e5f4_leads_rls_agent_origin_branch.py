"""leads_rls: add an agent branch scoped to own-originated, own-line leads

Revision ID: a9b8c7d6e5f4
Revises: c6d7e8f9a0b1
Create Date: 2026-07-24 00:00:00.000000

Agent Dashboard slice 1 needs agents to see/introduce leads they originated
(origin_agent_profile_uuid), the same way e6c7b8f9a0d1 scoped telecaller to
assigned_telecaller_profile_uuid. leads_rls currently has no 'agent' branch at
all — role='agent' matches none of the existing OR clauses, so an agent
session can see zero lead rows today.

USING lets the agent see their own-originated, own-line leads regardless of
status (read-only tracking after a telecaller picks it up). WITH CHECK adds
`assigned_telecaller_profile_uuid IS NULL` on top: the agent can only write
(introduce/edit) while the lead is still unassigned; once a telecaller has
it, the DB itself rejects the write (the API surfaces this as a 409), not
just an app-layer check. Deliberately different USING/WITH CHECK predicates,
same lesson as the D1 fix (d4a1b2c3e5f6) and the telecaller narrowing
(e6c7b8f9a0d1): asymmetric predicates either over-hide or under-restrict.

business_line is part of BOTH predicates: origin_agent_profile_uuid can
backfill onto a lead that is already on a DIFFERENT business line than the
introducing agent (capture_lead only fills business_line when it was
previously NULL, first-write-wins). The business_line match keeps a
cross-line lead invisible to the agent even if origin_agent_profile_uuid
points at them, preserving line segregation (every sibling branch already
does this).

FOR ALL / DROP + CREATE POLICY + one plain CREATE INDEX only — no enum or
GRANT DDL, so it runs fine through pgBouncer.

Rollback: downgrade restores the pre-existing predicate (no agent branch) and
drops the index.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a9b8c7d6e5f4"
down_revision: str | Sequence[str] | None = "c6d7e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREDICATE_NEW_USING = """
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
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'agent'
        AND origin_agent_profile_uuid IS NOT NULL
        AND origin_agent_profile_uuid::text = current_setting('app.agent_profile_uuid', true)
    )
"""

_PREDICATE_NEW_CHECK = """
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
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'agent'
        AND origin_agent_profile_uuid IS NOT NULL
        AND origin_agent_profile_uuid::text = current_setting('app.agent_profile_uuid', true)
        AND assigned_telecaller_profile_uuid IS NULL
    )
"""

# Pre-existing predicate (e6c7b8f9a0d1) — restored on downgrade. No agent branch.
_PREDICATE_OLD = """
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


def _recreate_policy(using: str, with_check: str) -> None:
    op.execute("DROP POLICY IF EXISTS leads_rls ON leads")
    op.execute(
        f"""
        CREATE POLICY leads_rls ON leads
        FOR ALL
        USING ({using})
        WITH CHECK ({with_check});
        """
    )


def upgrade() -> None:
    op.create_index("ix_leads_origin_agent_profile_uuid", "leads", ["origin_agent_profile_uuid"])
    _recreate_policy(_PREDICATE_NEW_USING, _PREDICATE_NEW_CHECK)


def downgrade() -> None:
    _recreate_policy(_PREDICATE_OLD, _PREDICATE_OLD)
    op.drop_index("ix_leads_origin_agent_profile_uuid", table_name="leads")
