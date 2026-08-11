"""Add field-level lead detail ownership and database enforcement.

Revision ID: bb23cc45dd67
Revises: aa12bb34cc56
Create Date: 2026-08-10
"""

# ruff: noqa: E501 -- SQL policy/trigger clauses are kept readable as executable SQL.

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "bb23cc45dd67"
down_revision: str | Sequence[str] | None = "aa12bb34cc56"
branch_labels: str | None = None
depends_on: str | None = None

_ADMIN = """
    current_setting('app.role', true) = 'admin'
    AND current_setting('app.platform_scope', true) = 'true'
"""

_CLIENT = """
    client_profile_uuid IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM client_profiles cp
        WHERE cp.id = leads.client_profile_uuid
          AND cp.auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
"""

_TELECALLER = """
    current_setting('app.business_line', true) <> ''
    AND business_line::text = current_setting('app.business_line', true)
    AND current_setting('app.role', true) = 'telecaller'
    AND assigned_telecaller_profile_uuid IS NOT NULL
    AND assigned_telecaller_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
"""

_LINE_STAFF = """
    current_setting('app.business_line', true) <> ''
    AND business_line::text = current_setting('app.business_line', true)
    AND current_setting('app.role', true) IN ('employee', 'sub_admin')
"""

_AGENT_READ = """
    current_setting('app.business_line', true) <> ''
    AND business_line::text = current_setting('app.business_line', true)
    AND current_setting('app.role', true) = 'agent'
    AND origin_agent_profile_uuid IS NOT NULL
    AND origin_agent_profile_uuid::text = current_setting('app.agent_profile_uuid', true)
"""

_AGENT_WRITE = f"""
    {_AGENT_READ}
    AND status::text IN ('new', 'assigned')
    AND agent_expired_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
"""

_AGENT_INSERT = f"""
    {_AGENT_READ}
    AND status::text = 'new'
    AND assigned_telecaller_profile_uuid IS NULL
    AND agent_expired_at IS NULL
    AND (name IS NULL OR lead_detail_actor_owns(detail_ownership -> 'name'))
    AND NOT EXISTS (
        SELECT 1
        FROM jsonb_object_keys(COALESCE(requirement, '{{}}'::jsonb)) AS requirement_key
        WHERE NOT (
            lead_detail_actor_owns(detail_ownership -> ('requirement.' || requirement_key))
            OR (
                requirement_key IN ('page', 'product', 'property_ref', 'topic')
                AND detail_ownership -> ('requirement.' || requirement_key) ->> 'role' = 'system'
                AND detail_ownership -> ('requirement.' || requirement_key) ->> 'subject_uuid' IS NULL
            )
        )
    )
"""


def _create_current_policies() -> None:
    select_predicate = f"""
        ({_ADMIN}) OR ({_CLIENT})
        OR ({_LINE_STAFF})
        OR ({_TELECALLER}) OR ({_AGENT_READ})
    """
    update_predicate = f"""
        ({_ADMIN}) OR ({_CLIENT}) OR ({_LINE_STAFF}) OR ({_TELECALLER}) OR ({_AGENT_WRITE})
    """
    op.execute(f"CREATE POLICY leads_select ON leads FOR SELECT USING ({select_predicate})")
    op.execute(
        f"CREATE POLICY leads_update ON leads FOR UPDATE "
        f"USING ({update_predicate}) WITH CHECK ({update_predicate})"
    )
    op.execute(
        f"CREATE POLICY leads_insert ON leads FOR INSERT "
        f"WITH CHECK (({_ADMIN}) OR ({_AGENT_INSERT}))"
    )
    op.execute(f"CREATE POLICY leads_delete ON leads FOR DELETE USING ({_ADMIN})")


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'lead_details_updated'")
    op.add_column(
        "leads",
        sa.Column(
            "detail_ownership",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    # Known capture metadata is system-owned. Known person-supplied fields are
    # attributed only when an authoritative profile exists; unknown legacy keys
    # fail closed as Admin-only instead of guessing who last wrote them.
    op.execute(
        """
        UPDATE leads AS l
        SET detail_ownership =
            CASE WHEN l.name IS NULL THEN '{}'::jsonb ELSE
                jsonb_build_object(
                    'name',
                    CASE
                        WHEN l.origin_agent_profile_uuid IS NOT NULL THEN
                            jsonb_build_object('role', 'agent', 'subject_uuid', l.origin_agent_profile_uuid::text)
                        WHEN l.client_profile_uuid IS NOT NULL THEN
                            jsonb_build_object('role', 'client', 'subject_uuid', l.client_profile_uuid::text)
                        ELSE jsonb_build_object('role', 'unclaimed', 'subject_uuid', NULL)
                    END
                )
            END
            || COALESCE((
                SELECT jsonb_object_agg(
                    'requirement.' || item.key,
                    CASE
                        WHEN item.key IN ('page', 'product', 'property_ref', 'topic') THEN
                            jsonb_build_object('role', 'system', 'subject_uuid', NULL)
                        WHEN item.key IN ('notes', 'message', 'email')
                             AND l.origin_agent_profile_uuid IS NOT NULL THEN
                            jsonb_build_object('role', 'agent', 'subject_uuid', l.origin_agent_profile_uuid::text)
                        WHEN item.key IN ('notes', 'message', 'email')
                             AND l.client_profile_uuid IS NOT NULL THEN
                            jsonb_build_object('role', 'client', 'subject_uuid', l.client_profile_uuid::text)
                        WHEN item.key IN ('notes', 'message', 'email') THEN
                            jsonb_build_object('role', 'unclaimed', 'subject_uuid', NULL)
                        ELSE jsonb_build_object('role', 'legacy_locked', 'subject_uuid', NULL)
                    END
                )
                FROM jsonb_each(COALESCE(l.requirement, '{}'::jsonb)) AS item
            ), '{}'::jsonb)
        """
    )

    op.execute(
        """
        CREATE FUNCTION lead_detail_actor_owns(descriptor jsonb) RETURNS boolean AS $$
            SELECT CASE descriptor ->> 'role'
                WHEN 'agent' THEN
                    current_setting('app.role', true) = 'agent'
                    AND descriptor ->> 'subject_uuid' = current_setting('app.agent_profile_uuid', true)
                WHEN 'client' THEN
                    current_setting('app.role', true) = 'client'
                    AND EXISTS (
                        SELECT 1 FROM client_profiles cp
                        WHERE cp.id::text = descriptor ->> 'subject_uuid'
                          AND cp.auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
                    )
                WHEN 'telecaller' THEN
                    current_setting('app.role', true) = 'telecaller'
                    AND descriptor ->> 'subject_uuid' = current_setting('app.staff_profile_uuid', true)
                WHEN 'admin' THEN
                    current_setting('app.role', true) = 'admin'
                    AND current_setting('app.platform_scope', true) = 'true'
                    AND descriptor ->> 'subject_uuid' = current_setting('app.auth_user_uuid', true)
                ELSE false
            END
        $$ LANGUAGE sql STABLE
        """
    )
    op.execute(
        """
        CREATE FUNCTION enforce_lead_detail_ownership() RETURNS trigger AS $$
        DECLARE
            actor_role text := current_setting('app.role', true);
            is_admin boolean := actor_role = 'admin'
                AND current_setting('app.platform_scope', true) = 'true';
            path text;
            requirement_key text;
            old_owner jsonb;
            new_owner jsonb;
        BEGIN
            IF current_user <> 'api_user' THEN
                RETURN NEW;
            END IF;

            IF NOT is_admin THEN
                IF actor_role IN ('agent', 'client') AND
                   (to_jsonb(NEW) - 'name' - 'requirement' - 'detail_ownership' - 'updated_at')
                   IS DISTINCT FROM
                   (to_jsonb(OLD) - 'name' - 'requirement' - 'detail_ownership' - 'updated_at') THEN
                    RAISE EXCEPTION 'lead workflow fields are not creator-editable'
                        USING ERRCODE = 'insufficient_privilege';
                ELSIF actor_role IN ('telecaller', 'employee', 'sub_admin') AND
                   (to_jsonb(NEW) - 'status' - 'updated_at')
                   IS DISTINCT FROM
                   (to_jsonb(OLD) - 'status' - 'updated_at') THEN
                    RAISE EXCEPTION 'staff detail changes require a creator or admin correction'
                        USING ERRCODE = 'insufficient_privilege';
                ELSIF actor_role NOT IN ('agent', 'client', 'telecaller', 'employee', 'sub_admin') THEN
                    RAISE EXCEPTION 'role cannot update leads'
                        USING ERRCODE = 'insufficient_privilege';
                END IF;
            END IF;

            IF NEW.name IS DISTINCT FROM OLD.name THEN
                path := 'name';
                old_owner := OLD.detail_ownership -> path;
                new_owner := NEW.detail_ownership -> path;
                IF old_owner IS NULL THEN
                    IF new_owner IS NULL OR (NOT is_admin AND NOT lead_detail_actor_owns(new_owner)) THEN
                        RAISE EXCEPTION 'new lead detail requires matching ownership'
                            USING ERRCODE = 'insufficient_privilege';
                    END IF;
                ELSIF NOT is_admin AND NOT lead_detail_actor_owns(old_owner) THEN
                    RAISE EXCEPTION 'lead detail is owned by another creator'
                        USING ERRCODE = 'insufficient_privilege';
                END IF;
            END IF;

            FOR path IN
                SELECT 'requirement.' || key
                FROM (
                    SELECT jsonb_object_keys(COALESCE(OLD.requirement, '{}'::jsonb)) AS key
                    UNION
                    SELECT jsonb_object_keys(COALESCE(NEW.requirement, '{}'::jsonb)) AS key
                ) keys
                WHERE COALESCE(OLD.requirement, '{}'::jsonb) -> key
                      IS DISTINCT FROM COALESCE(NEW.requirement, '{}'::jsonb) -> key
            LOOP
                old_owner := OLD.detail_ownership -> path;
                new_owner := NEW.detail_ownership -> path;
                IF old_owner IS NULL THEN
                    IF new_owner IS NULL OR (NOT is_admin AND NOT lead_detail_actor_owns(new_owner)) THEN
                        RAISE EXCEPTION 'new lead detail requires matching ownership'
                            USING ERRCODE = 'insufficient_privilege';
                    END IF;
                ELSIF NOT is_admin AND NOT lead_detail_actor_owns(old_owner) THEN
                    RAISE EXCEPTION 'lead detail is owned by another creator'
                        USING ERRCODE = 'insufficient_privilege';
                END IF;
            END LOOP;

            FOR path IN SELECT jsonb_object_keys(COALESCE(OLD.detail_ownership, '{}'::jsonb))
            LOOP
                IF NEW.detail_ownership -> path IS DISTINCT FROM OLD.detail_ownership -> path THEN
                    RAISE EXCEPTION 'existing lead detail ownership is immutable'
                        USING ERRCODE = 'check_violation';
                END IF;
            END LOOP;

            FOR path IN SELECT jsonb_object_keys(COALESCE(NEW.detail_ownership, '{}'::jsonb))
            LOOP
                IF OLD.detail_ownership -> path IS NULL THEN
                    IF path = 'name' THEN
                        IF OLD.name IS NOT NULL OR NEW.name IS NOT DISTINCT FROM OLD.name THEN
                            RAISE EXCEPTION 'ownership can only be added with a new lead detail'
                                USING ERRCODE = 'check_violation';
                        END IF;
                    ELSIF path LIKE 'requirement.%' THEN
                        requirement_key := substring(path FROM 13);
                        IF COALESCE(OLD.requirement, '{}'::jsonb) ? requirement_key
                           OR COALESCE(NEW.requirement, '{}'::jsonb) -> requirement_key
                              IS NOT DISTINCT FROM
                              COALESCE(OLD.requirement, '{}'::jsonb) -> requirement_key THEN
                            RAISE EXCEPTION 'ownership can only be added with a new lead detail'
                                USING ERRCODE = 'check_violation';
                        END IF;
                    ELSE
                        RAISE EXCEPTION 'unsupported lead detail ownership path'
                            USING ERRCODE = 'check_violation';
                    END IF;
                END IF;
            END LOOP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_leads_detail_ownership
        BEFORE UPDATE ON leads FOR EACH ROW
        EXECUTE FUNCTION enforce_lead_detail_ownership()
        """
    )

    op.execute("DROP POLICY IF EXISTS leads_rls ON leads")
    _create_current_policies()


def downgrade() -> None:
    for policy in ("leads_select", "leads_update", "leads_insert", "leads_delete"):
        op.execute(f"DROP POLICY IF EXISTS {policy} ON leads")
    op.execute("DROP TRIGGER IF EXISTS trg_leads_detail_ownership ON leads")
    op.execute("DROP FUNCTION IF EXISTS enforce_lead_detail_ownership()")
    op.execute("DROP FUNCTION IF EXISTS lead_detail_actor_owns(jsonb)")
    op.drop_column("leads", "detail_ownership")

    op.execute(
        f"""
        CREATE POLICY leads_rls ON leads FOR ALL
        USING (
            ({_ADMIN}) OR
            (client_profile_uuid IS NOT NULL AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)) OR
            (current_setting('app.business_line', true) <> '' AND business_line::text = current_setting('app.business_line', true) AND current_setting('app.role', true) IN ('employee', 'sub_admin')) OR
            ({_TELECALLER}) OR ({_AGENT_READ})
        )
        WITH CHECK (
            ({_ADMIN}) OR
            (client_profile_uuid IS NOT NULL AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)) OR
            (current_setting('app.business_line', true) <> '' AND business_line::text = current_setting('app.business_line', true) AND current_setting('app.role', true) IN ('employee', 'sub_admin')) OR
            ({_TELECALLER}) OR
            ({_AGENT_READ} AND assigned_telecaller_profile_uuid IS NULL)
        );
        """
    )
