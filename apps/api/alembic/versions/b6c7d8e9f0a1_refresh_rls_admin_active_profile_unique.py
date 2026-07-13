"""refresh_tokens RLS platform bypass + one active staff/agent profile per user.

Two audit fixes (2026-07-13 backend audit):

1. refresh_tokens_rls was the only policy in f2e4d6c8a0b1 without the
   platform-scope bypass every sibling table ORs in. Fails closed today (no
   admin session-management endpoint exists), but the first "Admin force-logout
   a user" feature would hit a silent 42501. Recreated with the same
   platform_scope OR own-rows shape as auth_events_rls.

2. Nothing stopped one auth_user_uuid from holding two ACTIVE StaffProfile or
   AgentProfile rows, contradicting the single-line staff/agent invariant.
   _build_access_claims resolves role/line via scalar() (first row, no error on
   duplicates), so corruption would flip a session's business_line
   nondeterministically instead of failing loudly. Partial unique indexes make
   the invariant a DB guarantee while still allowing historical
   inactive/suspended rows for the same person.

Rollback: downgrade() restores the original narrow policy and drops both
indexes. No data movement in either direction; safe to run on a live system
(tables are small at this stage; CREATE UNIQUE INDEX takes SHARE lock briefly).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS refresh_tokens_rls ON refresh_tokens;")
    op.execute(
        """
        CREATE POLICY refresh_tokens_rls ON refresh_tokens
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
            OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        );
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_staff_profiles_one_active_per_user
        ON staff_profiles (auth_user_uuid)
        WHERE status = 'active';
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_agent_profiles_one_active_per_user
        ON agent_profiles (auth_user_uuid)
        WHERE status = 'active';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_agent_profiles_one_active_per_user;")
    op.execute("DROP INDEX IF EXISTS uq_staff_profiles_one_active_per_user;")
    op.execute("DROP POLICY IF EXISTS refresh_tokens_rls ON refresh_tokens;")
    op.execute(
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
