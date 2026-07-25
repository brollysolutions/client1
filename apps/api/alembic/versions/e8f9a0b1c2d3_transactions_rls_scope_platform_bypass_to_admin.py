"""transactions_rls: scope the platform_scope bypass to admin, add sub_admin referral read

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-07-25 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (RLS policy
change requires a direct connection — ADR-0004).

`services.admin.create_staff` gives every sub_admin `ProfileScope.PLATFORM`
(scope = ProfileScope.PLATFORM if role == StaffRole.SUB_ADMIN else LINE), which
`services.auth_service._build_access_claims` turns into the JWT claim
`app.platform_scope = "true"`. transactions_rls's original predicate
(7a8b9c1d2e3f) treats `platform_scope = 'true'` alone as a full bypass, so
every sub_admin already has blanket read access to every user's cashback,
commission and referral_bonus rows today — undocumented and unintended
(c7d8e9f0a1b2's own docstring calls this exact pattern out as a hazard on
staff_profiles, and 9d2e3f4a5b6c's docstring on payouts already mislabels it as
"Admin / Sub Admin" bypass when only Admin was ever meant to have it).

This narrows the bypass to `role = 'admin'` and adds a purpose-built read
branch for `sub_admin`, scoped to `transaction_type = 'referral_bonus'` only
(Sub Admin's referral-bonus-config oversight view, SubAdmin_Dashboard_System_
Design.md §6.4 — sub_admin administers the bonus RULES, never sees cashback or
commission payouts, and there is no write grant on this table for sub_admin at
all: transactions is SELECT-only to api_user, unchanged from 7a8b9c1d2e3f).

This is the first table fixed in what should become a repo-wide audit: roughly
14 other tables (leads, loan_applications, payouts, tasks, auth_users,
client_profiles, and more) still treat platform_scope='true' as an
undifferentiated Admin/Sub-Admin bypass. That audit is out of scope here and is
tracked separately — this migration only closes the gap on transactions,
because the Sub Admin referral-bonus-config slice is what turns the latent gap
into a live one (a served endpoint reading this table for a sub_admin session).

Rollback: restores the exact pre-existing two-branch predicate from
7a8b9c1d2e3f.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | Sequence[str] | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREDICATE_OLD = """
    current_setting('app.platform_scope', true) = 'true'
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
"""

_PREDICATE_NEW = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (current_setting('app.platform_scope', true) = 'true'
        AND current_setting('app.role', true) = 'sub_admin'
        AND type::text = 'referral_bonus')
"""


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS transactions_rls ON transactions")
    op.execute(
        f"""
        CREATE POLICY transactions_rls ON transactions
        FOR ALL
        USING ({_PREDICATE_NEW})
        WITH CHECK ({_PREDICATE_NEW});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS transactions_rls ON transactions")
    op.execute(
        f"""
        CREATE POLICY transactions_rls ON transactions
        FOR ALL
        USING ({_PREDICATE_OLD})
        WITH CHECK ({_PREDICATE_OLD});
        """
    )
