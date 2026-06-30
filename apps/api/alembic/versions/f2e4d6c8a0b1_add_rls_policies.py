"""add RLS policies and api_user role

Revision ID: f2e4d6c8a0b1
Revises: a3f2c1d4e5b6
Create Date: 2026-06-30 12:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer.
DDL + role creation require a direct connection (ADR-0004).

Design (Auth System Design §13):
  The FastAPI app connects as the 'app' superuser.  Superusers bypass RLS
  unconditionally, so we cannot rely on ENABLE ROW LEVEL SECURITY alone.
  Instead every protected request calls SET LOCAL ROLE api_user (non-superuser)
  inside _set_rls_context().  RLS policies then apply to that transaction.
  Public endpoints (register, OTP, login) run as the 'app' superuser and
  bypass RLS by design — they need unrestricted access to auth_users.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f2e4d6c8a0b1"
down_revision: str | Sequence[str] | None = "a3f2c1d4e5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [
    "auth_users",
    "client_profiles",
    "agent_profiles",
    "staff_profiles",
    "agent_applications",
    "refresh_tokens",
    "auth_events",
]


def upgrade() -> None:
    conn = op.get_bind()

    # --- Create non-superuser role for authenticated API requests ---
    conn.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'api_user') THEN
                CREATE ROLE api_user;
            END IF;
        END
        $$;
        """
    )
    conn.execute("GRANT USAGE ON SCHEMA public TO api_user;")
    conn.execute(
        f"""
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            {", ".join(_TABLES)}
        TO api_user;
        """
    )

    # --- Enable RLS ---
    for table in _TABLES:
        conn.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")

    # --- Policies ---

    # auth_users: own row only; platform Admin/Sub Admin see all
    conn.execute(
        """
        CREATE POLICY auth_users_rls ON auth_users
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR id::text = current_setting('app.auth_user_uuid', true)
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
            OR id::text = current_setting('app.auth_user_uuid', true)
        );
        """
    )

    # client_profiles: own profiles; line staff see their line; Admin sees all
    conn.execute(
        """
        CREATE POLICY client_profiles_rls ON client_profiles
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
            OR (
                current_setting('app.business_line', true) <> ''
                AND business_line::text = current_setting('app.business_line', true)
                AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
            )
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
            OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        );
        """
    )

    # agent_profiles: own profile; line staff see their line; Admin sees all
    conn.execute(
        """
        CREATE POLICY agent_profiles_rls ON agent_profiles
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
            OR (
                current_setting('app.business_line', true) <> ''
                AND business_line::text = current_setting('app.business_line', true)
                AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
            )
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
            OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        );
        """
    )

    # staff_profiles: own row; Admin sees all; only Admin can create/modify
    conn.execute(
        """
        CREATE POLICY staff_profiles_rls ON staff_profiles
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
        );
        """
    )

    # agent_applications: applicant sees own; Admin/Sub Admin see all
    conn.execute(
        """
        CREATE POLICY agent_applications_rls ON agent_applications
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR (
                applicant_auth_user_uuid IS NOT NULL
                AND applicant_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
            )
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
            OR (
                applicant_auth_user_uuid IS NOT NULL
                AND applicant_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
            )
        );
        """
    )

    # refresh_tokens: users see and manage own tokens only
    conn.execute(
        """
        CREATE POLICY refresh_tokens_rls ON refresh_tokens
        FOR ALL
        USING (
            auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        )
        WITH CHECK (
            auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        );
        """
    )

    # auth_events: users see own events; Admin sees all; system inserts via superuser
    conn.execute(
        """
        CREATE POLICY auth_events_rls ON auth_events
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR (
                auth_user_uuid IS NOT NULL
                AND auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
            )
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
            OR (
                auth_user_uuid IS NOT NULL
                AND auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
            )
        );
        """
    )


def downgrade() -> None:
    conn = op.get_bind()

    for table in _TABLES:
        conn.execute(f"DROP POLICY IF EXISTS {table}_rls ON {table};")
        conn.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    conn.execute(f"REVOKE SELECT, INSERT, UPDATE, DELETE ON {', '.join(_TABLES)} FROM api_user;")
    conn.execute("REVOKE USAGE ON SCHEMA public FROM api_user;")
    conn.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'api_user') THEN
                DROP ROLE api_user;
            END IF;
        END
        $$;
        """
    )
