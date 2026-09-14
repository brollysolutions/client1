"""Allow platform Admin to delete unused financial products.

Revision ID: f3b5d7e9a1c2
Revises: e2a4c6f8b0d3

Existing application/enquiry/offer FKs prevent removal of referenced products.
Only disposable bank availability overrides retain their existing cascade.
No data is deleted by this migration; audit history survives product removal.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f3b5d7e9a1c2"
down_revision: str | Sequence[str] | None = "e2a4c6f8b0d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'loan_type_deleted'")
    op.execute("GRANT DELETE ON loan_types TO api_user")
    op.execute("""
        CREATE POLICY loan_types_delete ON loan_types FOR DELETE USING (
            current_setting('app.platform_scope', true) = 'true'
            AND current_setting('app.role', true) = 'admin'
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY loan_types_delete ON loan_types")
    op.execute("REVOKE DELETE ON loan_types FROM api_user")
    # Enum values cannot be removed safely while retained audit rows use them.
