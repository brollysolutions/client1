"""merge loan-transaction validation and staff-invite heads

Revision ID: c2d8e4f6a901
Revises: 84a5b6c7d8e9, b1f7c93ad204
Create Date: 2026-08-28

The Lead Details validation work and the staff first-login invite work were
developed from the same Alembic revision and merged independently. That left
two valid migration branches but no singular ``head``, so the API startup
command aborted before applying either branch.

Both parent migrations are independent: one adds a loan-transaction check
constraint and the other adds the staff-invite table, audit enum members,
grants, and RLS policies. No schema or data reconciliation is required. This
empty merge revision only rejoins their ancestry so ``alembic upgrade head``
applies both branches and reaches one deterministic head.
"""

from collections.abc import Sequence

revision: str = "c2d8e4f6a901"
down_revision: str | Sequence[str] | None = ("84a5b6c7d8e9", "b1f7c93ad204")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
