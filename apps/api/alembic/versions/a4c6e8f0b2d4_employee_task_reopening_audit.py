"""Add an immutable audit action for cancelled-task reopening.

Revision ID: a4c6e8f0b2d4
Revises: f3b5d7e9a1c2
"""

from alembic import op

revision = "a4c6e8f0b2d4"
down_revision = "f3b5d7e9a1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'employee_task_reopened'")


def downgrade() -> None:
    # PostgreSQL enum removal would destroy historical audit compatibility.
    pass
