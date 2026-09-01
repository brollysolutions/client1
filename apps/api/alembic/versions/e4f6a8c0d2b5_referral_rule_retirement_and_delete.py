"""add guarded referral-rule deletion and audit actions

Revision ID: e4f6a8c0d2b5
Revises: d3e5f7a9b1c4
Create Date: 2026-08-28 18:00:00.000000

Only retired rules that have never been selected by a referral may be deleted.
The existing foreign key remains the final history-preserving backstop. RLS
allows an owning Sub Admin or a platform Admin to execute the guarded command.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e4f6a8c0d2b5"
down_revision: str | Sequence[str] | None = "d3e5f7a9b1c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PLATFORM_ADMIN = """
    current_setting('app.role', true) = 'admin'
    AND current_setting('app.platform_scope', true) = 'true'
"""


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in (
            "referral_rule_created",
            "referral_rule_updated",
            "referral_rule_deleted",
        ):
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")

    op.execute("GRANT DELETE ON referral_bonus_config TO api_user")
    op.execute(
        f"""
        CREATE POLICY referral_bonus_config_delete ON referral_bonus_config
        FOR DELETE
        USING (
            (current_setting('app.role', true) = 'sub_admin'
             AND created_by_uuid::text = current_setting('app.auth_user_uuid', true))
            OR ({_PLATFORM_ADMIN})
        )
        """
    )

    # Delegated Sub Admins are payout makers, not platform-wide reviewers.
    # Restrict their rows to requests they raised while preserving Admin's
    # complete maker-checker queue.
    op.execute("DROP POLICY IF EXISTS payouts_rls ON payouts")
    op.execute(
        """
        CREATE POLICY payouts_rls ON payouts
        FOR ALL
        USING (
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'admin')
            OR
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'sub_admin'
             AND current_setting('app.staff_features', true) = 'payout_requests'
             AND maker_user_uuid::text = current_setting('app.auth_user_uuid', true))
        )
        WITH CHECK (
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'admin')
            OR
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'sub_admin'
             AND current_setting('app.staff_features', true) = 'payout_requests'
             AND maker_user_uuid::text = current_setting('app.auth_user_uuid', true))
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS payouts_rls ON payouts")
    op.execute(
        """
        CREATE POLICY payouts_rls ON payouts
        FOR ALL
        USING (
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'admin')
            OR
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'sub_admin'
             AND current_setting('app.staff_features', true) = 'payout_requests')
        )
        WITH CHECK (
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'admin')
            OR
            (current_setting('app.platform_scope', true) = 'true'
             AND current_setting('app.role', true) = 'sub_admin'
             AND current_setting('app.staff_features', true) = 'payout_requests')
        )
        """
    )
    op.execute("DROP POLICY IF EXISTS referral_bonus_config_delete ON referral_bonus_config")
    op.execute("REVOKE DELETE ON referral_bonus_config FROM api_user")
    # PostgreSQL enum labels are intentionally retained on downgrade; removing
    # them would require rebuilding audit_log and risks historical audit rows.
