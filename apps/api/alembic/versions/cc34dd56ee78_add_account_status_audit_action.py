"""add admin operational-audit actions and property status update grant

Revision ID: cc34dd56ee78
Revises: bb23cc45dd67
"""

from collections.abc import Sequence

from alembic import op

revision: str = "cc34dd56ee78"
down_revision: str | Sequence[str] | None = "bb23cc45dd67"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'account_status_updated'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'property_listing_updated'")
    op.execute("GRANT UPDATE ON properties TO api_user")
    op.execute(
        """
        CREATE POLICY properties_admin_update ON properties FOR UPDATE
        USING (
            current_setting('app.role', true) = 'admin'
            AND current_setting('app.platform_scope', true) = 'true'
        )
        WITH CHECK (
            current_setting('app.role', true) = 'admin'
            AND current_setting('app.platform_scope', true) = 'true'
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS properties_admin_update ON properties")
    op.execute("REVOKE UPDATE ON properties FROM api_user")
    # PostgreSQL enums cannot remove an individual value safely.
