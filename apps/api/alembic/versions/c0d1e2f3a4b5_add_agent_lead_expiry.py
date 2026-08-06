"""add fixed Agent lead-expiry window, audit/notification types, and RLS lock

Revision ID: c0d1e2f3a4b5
Revises: a5b6c7d8e9f0
Create Date: 2026-08-06 00:00:00.000000

FR-4.6 gives an Agent a fixed conversion window, after which an unconverted
lead returns to the open Telecaller pool without losing its immutable origin or
business line. ``expires_at`` is the deadline; ``agent_expired_at`` is the
one-time ownership transition marker kept independently from operational lead
status so an expired lead can later move through assigned/working/converted.

Legacy eligible rows receive at least seven days of rollout grace. Converted
and closed rows are terminal and are not backfilled. A deferred constraint
trigger rejects new Agent attribution when the same mobile has ended Agent
history, preventing the originating or another Agent from restarting the clock
without changing the existing active-mobile index semantics. Its global lookup
runs as the function owner with a fixed safe search path so an RLS-scoped caller
cannot hide another Agent's history from the invariant.

The Agent RLS read branch remains unchanged for history. WITH CHECK additionally
requires a missing expiry marker and a future deadline, making due/post-expiry
writes fail at the database boundary even if an API regression bypasses the
service guard.

NOTE: Run directly against postgres:5432, not pgBouncer. This migration changes
Postgres enums and an RLS policy and requires the normal rolling restart for
connection-holding services (ADR-0004).

Rollback removes the columns, index, trigger, and policy guard. Postgres enum
labels are additive and cannot be removed safely, so the two new labels remain
in their enum types after downgrade.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c0d1e2f3a4b5"
down_revision: str | Sequence[str] | None = "a5b6c7d8e9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DUE_PREDICATE = (
    "expires_at IS NOT NULL AND agent_expired_at IS NULL AND status NOT IN ('converted', 'closed')"
)
_IMMUTABLE_FN = "enforce_agent_lead_expiry_immutable"
_NO_RESET_FN = "enforce_agent_lead_expiry_no_reset"

_SCOPE_ADMIN = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
"""

_USING = f"""
    {_SCOPE_ADMIN}
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

_CHECK_OLD = f"""
    {_SCOPE_ADMIN}
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

_CHECK_NEW = _CHECK_OLD.replace(
    "        AND assigned_telecaller_profile_uuid IS NULL\n    )\n",
    "        AND assigned_telecaller_profile_uuid IS NULL\n"
    "        AND agent_expired_at IS NULL\n"
    "        AND (expires_at IS NULL OR expires_at > now())\n"
    "    )\n",
)


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
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'agent_lead_expired'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'agent_lead_expired'")

    op.add_column("leads", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("agent_expired_at", sa.DateTime(timezone=True), nullable=True))
    # Preserve the original 30-day clock where possible without surprising
    # operators by sweeping every old overdue row immediately after deploy.
    op.execute(
        """
        UPDATE leads
        SET expires_at = GREATEST(
            created_at + INTERVAL '30 days',
            now() + INTERVAL '7 days'
        )
        WHERE origin_agent_profile_uuid IS NOT NULL
          AND status NOT IN ('converted', 'closed')
          AND expires_at IS NULL
        """
    )

    op.create_index(
        "ix_leads_agent_expiry_due",
        "leads",
        ["expires_at", "id"],
        postgresql_where=sa.text(_DUE_PREDICATE),
    )
    op.execute(
        f"""
        CREATE FUNCTION {_IMMUTABLE_FN}() RETURNS trigger AS $$
        BEGIN
            IF OLD.expires_at IS NOT NULL
               AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
                RAISE EXCEPTION 'expires_at is immutable once set'
                    USING ERRCODE = 'check_violation';
            END IF;
            IF OLD.agent_expired_at IS NOT NULL
               AND NEW.agent_expired_at IS DISTINCT FROM OLD.agent_expired_at THEN
                RAISE EXCEPTION 'agent_expired_at is immutable once set'
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        f"""
        CREATE FUNCTION {_NO_RESET_FN}() RETURNS trigger AS $$
        DECLARE
            attribution_started boolean := false;
        BEGIN
            IF TG_OP = 'INSERT' THEN
                attribution_started := NEW.origin_agent_profile_uuid IS NOT NULL;
            ELSIF TG_OP = 'UPDATE' THEN
                attribution_started := OLD.origin_agent_profile_uuid IS NULL
                    AND NEW.origin_agent_profile_uuid IS NOT NULL;
            END IF;

            IF attribution_started AND EXISTS (
                SELECT 1 FROM leads
                WHERE mobile = NEW.mobile
                  AND id <> NEW.id
                  AND (
                      agent_expired_at IS NOT NULL
                      OR (expires_at IS NOT NULL AND expires_at <= clock_timestamp())
                  )
            ) THEN
                RAISE EXCEPTION
                    'an Agent ownership window already ended for this mobile'
                    USING ERRCODE = 'unique_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public;
        """
    )
    op.execute(
        f"CREATE TRIGGER trg_leads_agent_expiry_immutable "
        f"BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION {_IMMUTABLE_FN}()"
    )
    # Check at transaction end, after any unique-index wait or ON CONFLICT
    # update has resolved. Reached deadlines are already committed state, so
    # the check needs no second lock and cannot deadlock with the scheduler's
    # row locks.
    op.execute(
        f"CREATE CONSTRAINT TRIGGER trg_leads_agent_expiry_no_reset "
        f"AFTER INSERT OR UPDATE ON leads DEFERRABLE INITIALLY DEFERRED "
        f"FOR EACH ROW EXECUTE FUNCTION {_NO_RESET_FN}()"
    )
    _recreate_policy(_CHECK_NEW)


def downgrade() -> None:
    _recreate_policy(_CHECK_OLD)
    op.execute("DROP TRIGGER IF EXISTS trg_leads_agent_expiry_no_reset ON leads")
    op.execute("DROP TRIGGER IF EXISTS trg_leads_agent_expiry_immutable ON leads")
    op.execute(f"DROP FUNCTION IF EXISTS {_NO_RESET_FN}()")
    op.execute(f"DROP FUNCTION IF EXISTS {_IMMUTABLE_FN}()")
    op.drop_index("ix_leads_agent_expiry_due", table_name="leads")
    op.drop_column("leads", "agent_expired_at")
    op.drop_column("leads", "expires_at")
