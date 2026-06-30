"""auth_users email NOT NULL + UNIQUE + email_verified_at

Revision ID: 7a1c2b3d4e5f
Revises: f2e4d6c8a0b1
Create Date: 2026-06-30 20:30:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (DDL — ADR-0004).

Email is now mandatory and unique (collected at registration; verified later via the
post-login email-verify flow). `email_verified_at` mirrors `phone_verified_at`.

Expand/contract note (production): the prod-safe path is add nullable column →
backfill → CREATE UNIQUE INDEX CONCURRENTLY → validate → SET NOT NULL. This repo is
pre-launch, so a single-shot ALTER is acceptable; we still backfill any pre-existing
NULL emails with a unique placeholder so SET NOT NULL + UNIQUE cannot fail.

Rollback: drop the unique constraint, revert email to nullable, drop email_verified_at.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7a1c2b3d4e5f"
down_revision: str | Sequence[str] | None = "f2e4d6c8a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "auth_users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill rows created while email was optional, so the NOT NULL + UNIQUE hold.
    op.execute(
        "UPDATE auth_users "
        "SET email = 'noemail+' || id::text || '@placeholder.invalid' "
        "WHERE email IS NULL"
    )
    op.alter_column("auth_users", "email", existing_type=sa.String(), nullable=False)
    op.create_unique_constraint(op.f("uq_auth_users_email"), "auth_users", ["email"])


def downgrade() -> None:
    op.drop_constraint(op.f("uq_auth_users_email"), "auth_users", type_="unique")
    op.alter_column("auth_users", "email", existing_type=sa.String(), nullable=True)
    op.drop_column("auth_users", "email_verified_at")
