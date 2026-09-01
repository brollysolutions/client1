"""add controlled-correction and operational audit actions

Revision ID: d9f1a3b5c7e0
Revises: c8d0e2f4a6b9
Create Date: 2026-08-30 09:00:00.000000

The new values close the original FR-2.2 audit gaps without changing table
grants or RLS policies. Every writer appends its audit row in the same
transaction as the business mutation. PostgreSQL enum values are intentionally
retained on downgrade: removing a value is destructive and is not supported by
ALTER TYPE.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d9f1a3b5c7e0"
down_revision: str | Sequence[str] | None = "c8d0e2f4a6b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIONS = (
    "property_listing_corrected",
    "content_block_created",
    "content_block_updated",
    "content_block_published",
    "content_block_archived",
    "loan_application_updated",
    "property_deal_updated",
)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for action in _ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    # PostgreSQL cannot safely remove individual enum values. The application
    # rollback stops writing these labels; retaining them preserves old audit rows.
    pass
