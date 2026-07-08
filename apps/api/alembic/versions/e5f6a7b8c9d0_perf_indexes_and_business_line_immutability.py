"""perf indexes on RLS/FK columns + business_line immutability trigger

Revision ID: e5f6a7b8c9d0
Revises: d4a1b2c3e5f6
Create Date: 2026-07-08 00:00:00.000000

Audit findings P-perf2 and D2.

P-perf2 — Postgres does not auto-index FK columns. These columns are filtered on
every authenticated request or hot auth path but had no index, forcing sequential
scans that degrade as the tables grow:
  - refresh_tokens.token_hash          (looked up on every /refresh and /logout)
  - staff_profiles.auth_user_uuid      (scanned on every login by _build_access_claims)
  - agent_profiles.auth_user_uuid      (same)
  - auth_events.auth_user_uuid         (RLS predicate)
  - agent_applications.applicant_auth_user_uuid (RLS predicate)
  - leads.client_profile_uuid          (RLS predicate)
client_profiles.auth_user_uuid is already covered by the composite unique
(auth_user_uuid, business_line), so it is intentionally omitted.

Plain CREATE INDEX (transactional) is fine here — the tables are effectively empty
pre-launch. On a populated production table these should be CREATE INDEX
CONCURRENTLY outside a transaction.

D2 — business_line is the segregation discriminator and must be immutable once
set, but it was a plain mutable column on every business-scoped table. A trigger
now rejects changing an already-set business_line (value -> different value, or
value -> NULL). NULL -> value is still allowed: leads (and staff_profiles) start
with an unknown line that a later triage step assigns. This is defense-in-depth
beyond leads_rls WITH CHECK (d4a1b2c3e5f6) and, unlike RLS, also binds the
platform-admin / superuser paths.

Rollback: downgrade drops the indexes, the triggers, and the function.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4a1b2c3e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (index name, table, column)
_INDEXES = [
    ("ix_refresh_tokens_token_hash", "refresh_tokens", "token_hash"),
    ("ix_staff_profiles_auth_user_uuid", "staff_profiles", "auth_user_uuid"),
    ("ix_agent_profiles_auth_user_uuid", "agent_profiles", "auth_user_uuid"),
    ("ix_auth_events_auth_user_uuid", "auth_events", "auth_user_uuid"),
    (
        "ix_agent_applications_applicant_auth_user_uuid",
        "agent_applications",
        "applicant_auth_user_uuid",
    ),
    ("ix_leads_client_profile_uuid", "leads", "client_profile_uuid"),
]

# Tables whose business_line must be immutable once set.
_IMMUTABLE_TABLES = [
    "client_profiles",
    "agent_profiles",
    "staff_profiles",
    "agent_applications",
    "leads",
]

_FN = "enforce_business_line_immutable"


def upgrade() -> None:
    for name, table, column in _INDEXES:
        op.create_index(name, table, [column])

    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION {_FN}() RETURNS trigger AS $$
        BEGIN
            -- Allow first assignment (NULL -> value) and no-op updates; reject any
            -- change to an already-set business_line, including value -> NULL.
            IF OLD.business_line IS NOT NULL
               AND NEW.business_line IS DISTINCT FROM OLD.business_line THEN
                RAISE EXCEPTION
                    'business_line is immutable once set (was %, got %)',
                    OLD.business_line, NEW.business_line
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    for table in _IMMUTABLE_TABLES:
        op.execute(
            f"CREATE TRIGGER trg_{table}_business_line_immutable "
            f"BEFORE UPDATE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
        )


def downgrade() -> None:
    for table in _IMMUTABLE_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_business_line_immutable ON {table}")
    op.execute(f"DROP FUNCTION IF EXISTS {_FN}()")
    for name, table, _ in _INDEXES:
        op.drop_index(name, table_name=table)
