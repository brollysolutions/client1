"""complete per-line lead journeys and assignment invariants

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-08-08 00:00:00.000000

FR-4.2/FR-4.3 require independent Loans and Real Estate follow-up for one
verified mobile. The original mobile-only live index could represent only one
of those journeys. This migration changes the live identity to
``(mobile, business_line)``, keeps one unresolved capture per mobile, preserves
global Agent ownership, and treats RELEASED as a live open-pool state.

Existing duplicate released rows are closed only when another non-closed row
already represents the same journey. Agent history remains visible through the
immutable ``agent_expired_at`` projection.

The assignment trigger is a database backstop behind service validation: a
lead can reference only an active same-line Telecaller, and a claimed lead's
Client profile must belong to the same line. It runs as its owner with a fixed
search path so RLS-scoped callers cannot hide the referenced profile.

Legacy ``both`` leads are closed and returned to unresolved history before the
operational-line check is installed. A separately authorized, fixed-search-path
helper closes profile-bound and same-mobile leads during account deletion.

``lead_assigned`` is additive to PostgreSQL's audit enum and intentionally
remains after downgrade.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: str | Sequence[str] | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LIVE = "status <> 'closed'"
_OLD_ACTIVE = "status NOT IN ('closed', 'released')"
_VALIDATE_FN = "validate_lead_assignment_scope"
_CLOSE_ACCOUNT_FN = "close_account_leads"


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'lead_assigned'")
    op.drop_index("uq_leads_mobile_active", table_name="leads")

    # `both` was historically representable by the shared enum but cannot be
    # routed without crossing line-scoped RLS. Preserve the row as closed,
    # unresolved history. Temporarily remove only this table's shared
    # immutability trigger so the one-time normalization is explicit.
    op.execute("DROP TRIGGER IF EXISTS trg_leads_business_line_immutable ON leads")
    op.execute(
        """
        UPDATE leads
        SET business_line = NULL,
            status = 'closed',
            assigned_telecaller_profile_uuid = NULL,
            updated_at = now()
        WHERE business_line = 'both'
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_leads_business_line_immutable
        BEFORE UPDATE ON leads
        FOR EACH ROW EXECUTE FUNCTION enforce_business_line_immutable()
        """
    )

    # The old index allowed a released row and one active row for the same
    # journey. Keep the active row (or newest released row) and close only the
    # superseded released history before RELEASED joins the live predicate.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY mobile, business_line
                       ORDER BY CASE WHEN status = 'released' THEN 1 ELSE 0 END,
                                updated_at DESC,
                                id DESC
                   ) AS position
            FROM leads
            WHERE status <> 'closed'
        )
        UPDATE leads AS target
        SET status = 'closed', updated_at = now()
        FROM ranked
        WHERE target.id = ranked.id
          AND ranked.position > 1
          AND target.status = 'released'
        """
    )
    # Preserve the global first-Agent ownership invariant if a legacy released
    # Agent row coexists with a newer line journey.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY mobile
                       ORDER BY CASE WHEN status = 'released' THEN 1 ELSE 0 END,
                                updated_at DESC,
                                id DESC
                   ) AS position
            FROM leads
            WHERE status <> 'closed'
              AND origin_agent_profile_uuid IS NOT NULL
              AND agent_expired_at IS NULL
        )
        UPDATE leads AS target
        SET status = 'closed', updated_at = now()
        FROM ranked
        WHERE target.id = ranked.id
          AND ranked.position > 1
          AND target.status = 'released'
        """
    )

    # Registration did not bind leads before this revision. Attach live,
    # exact-line rows to an already-registered active Client so later RLS,
    # account deletion, and re-registration behavior is consistent for legacy
    # accounts as well as newly verified ones.
    op.execute(
        """
        UPDATE leads AS lead
        SET client_profile_uuid = client.id,
            updated_at = now()
        FROM auth_users AS auth
        JOIN client_profiles AS client
          ON client.auth_user_uuid = auth.id
         AND client.status = 'active'
        WHERE lead.mobile = auth.mobile
          AND auth.status = 'active'
          AND lead.business_line = client.business_line
          AND lead.client_profile_uuid IS NULL
          AND lead.status <> 'closed'
        """
    )

    # c0d1e2f3a4b5 installed a deferred constraint trigger on leads. The cleanup
    # and backfill UPDATEs above queue that trigger, and PostgreSQL refuses the
    # ALTER TABLE below while trigger events are pending. Evaluate all queued
    # constraints now; any invariant failure still aborts this migration.
    op.execute("SET CONSTRAINTS ALL IMMEDIATE")

    op.create_check_constraint(
        op.f("ck_leads_lead_business_line_is_operational"),
        "leads",
        "business_line IS NULL OR business_line::text IN ('loans', 'real_estate')",
    )
    op.create_index(
        "uq_leads_mobile_line_live",
        "leads",
        ["mobile", "business_line"],
        unique=True,
        postgresql_where=sa.text("business_line IS NOT NULL AND status <> 'closed'"),
    )
    op.create_index(
        "uq_leads_mobile_unresolved_live",
        "leads",
        ["mobile"],
        unique=True,
        postgresql_where=sa.text("business_line IS NULL AND status <> 'closed'"),
    )
    op.create_index(
        "uq_leads_mobile_agent_live",
        "leads",
        ["mobile"],
        unique=True,
        postgresql_where=sa.text(
            "origin_agent_profile_uuid IS NOT NULL "
            "AND agent_expired_at IS NULL AND status <> 'closed'"
        ),
    )
    op.create_index(
        "ix_leads_assignment_workload",
        "leads",
        ["business_line", "assigned_telecaller_profile_uuid", "status"],
        postgresql_where=sa.text("assigned_telecaller_profile_uuid IS NOT NULL"),
    )

    op.execute(
        f"""
        CREATE FUNCTION {_VALIDATE_FN}() RETURNS trigger AS $$
        BEGIN
            IF NEW.assigned_telecaller_profile_uuid IS NOT NULL
               AND (
                   TG_OP = 'INSERT'
                   OR NEW.assigned_telecaller_profile_uuid IS DISTINCT FROM
                      OLD.assigned_telecaller_profile_uuid
                   OR NEW.business_line IS DISTINCT FROM OLD.business_line
               )
               AND NOT EXISTS (
                SELECT 1
                FROM public.staff_profiles AS staff
                WHERE staff.id = NEW.assigned_telecaller_profile_uuid
                  AND staff.role = 'telecaller'
                  AND staff.status = 'active'
                  AND staff.business_line = NEW.business_line
            ) THEN
                RAISE EXCEPTION 'lead assignee must be an active same-line telecaller'
                    USING ERRCODE = 'check_violation';
            END IF;

            IF NEW.client_profile_uuid IS NOT NULL
               AND (
                   TG_OP = 'INSERT'
                   OR NEW.client_profile_uuid IS DISTINCT FROM OLD.client_profile_uuid
                   OR NEW.business_line IS DISTINCT FROM OLD.business_line
               )
               AND NOT EXISTS (
                SELECT 1
                FROM public.client_profiles AS client
                WHERE client.id = NEW.client_profile_uuid
                  AND client.business_line = NEW.business_line
            ) THEN
                RAISE EXCEPTION 'lead client profile must match the lead business line'
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public;
        """
    )
    op.execute(
        f"""
        CREATE TRIGGER trg_validate_lead_assignment_scope
        BEFORE INSERT OR UPDATE OF business_line,
            assigned_telecaller_profile_uuid, client_profile_uuid
        ON leads
        FOR EACH ROW EXECUTE FUNCTION {_VALIDATE_FN}()
        """
    )
    op.execute(f"REVOKE ALL ON FUNCTION {_VALIDATE_FN}() FROM PUBLIC")
    op.execute(
        f"""
        CREATE FUNCTION {_CLOSE_ACCOUNT_FN}(target_auth_user_uuid uuid)
        RETURNS integer AS $$
        DECLARE
            closed_count integer;
        BEGIN
            IF NOT (
                target_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
                OR (
                    current_setting('app.role', true) = 'admin'
                    AND current_setting('app.platform_scope', true) = 'true'
                )
            ) THEN
                RAISE EXCEPTION 'lead closure is not authorized'
                    USING ERRCODE = '42501';
            END IF;

            UPDATE public.leads
            SET status = 'closed',
                assigned_telecaller_profile_uuid = NULL,
                updated_at = now()
            WHERE status <> 'closed'
              AND (
                  mobile = (
                      SELECT auth.mobile
                      FROM public.auth_users AS auth
                      WHERE auth.id = target_auth_user_uuid
                  )
                  OR client_profile_uuid IN (
                      SELECT client.id
                      FROM public.client_profiles AS client
                      WHERE client.auth_user_uuid = target_auth_user_uuid
                  )
              );
            GET DIAGNOSTICS closed_count = ROW_COUNT;
            RETURN closed_count;
        END;
        $$ LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public;
        """
    )
    op.execute(f"REVOKE ALL ON FUNCTION {_CLOSE_ACCOUNT_FN}(uuid) FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION {_CLOSE_ACCOUNT_FN}(uuid) TO api_user")


def downgrade() -> None:
    op.execute(f"DROP FUNCTION IF EXISTS {_CLOSE_ACCOUNT_FN}(uuid)")
    op.execute("DROP TRIGGER IF EXISTS trg_validate_lead_assignment_scope ON leads")
    op.execute(f"DROP FUNCTION IF EXISTS {_VALIDATE_FN}()")
    op.drop_index("ix_leads_assignment_workload", table_name="leads")
    op.drop_index("uq_leads_mobile_agent_live", table_name="leads")
    op.drop_index("uq_leads_mobile_unresolved_live", table_name="leads")
    op.drop_index("uq_leads_mobile_line_live", table_name="leads")
    op.drop_constraint(op.f("ck_leads_lead_business_line_is_operational"), "leads", type_="check")

    # The legacy index admits only one active row per mobile. Preserve the most
    # recently updated row and return any additional active journey to the open
    # pool so downgrade remains executable without deleting history.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY mobile
                       ORDER BY updated_at DESC, id DESC
                   ) AS position
            FROM leads
            WHERE status NOT IN ('closed', 'released')
        )
        UPDATE leads AS target
        SET status = 'released',
            assigned_telecaller_profile_uuid = NULL,
            released_at = now(),
            release_reason = 'Migration downgrade returned this journey to the open pool.',
            updated_at = now()
        FROM ranked
        WHERE target.id = ranked.id
          AND ranked.position > 1
        """
    )
    op.execute("SET CONSTRAINTS ALL IMMEDIATE")
    op.create_index(
        "uq_leads_mobile_active",
        "leads",
        ["mobile"],
        unique=True,
        postgresql_where=sa.text(_OLD_ACTIVE),
    )
