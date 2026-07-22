"""grant INSERT on loan_applications

Revision ID: 8b9c1d2e3f4a
Revises: 7a8b9c1d2e3f
Create Date: 2026-07-21 02:30:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT
requires a direct connection — ADR-0004 / see f2e4d6c8a0b1).

loan_applications (2b3c4d5e6f7a) shipped SELECT-only because no create
endpoint existed yet ("no staff/telecaller workflow to open... a
loan_applications row"). This migration is that follow-up, but for a CLIENT
write path (dashboard "Apply" creating its own application), not a staff one.

No table/column/policy change: the existing RLS predicate's client branch
(`client_profile_uuid::text = current_setting('app.client_profile_uuid')`)
already permits a client's own INSERT under WITH CHECK — verified identical
to USING since 2b3c4d5e6f7a. The only reason a client insert has been
impossible until now is the missing grant.

Rollback: revoke the grant only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "8b9c1d2e3f4a"
down_revision: str | Sequence[str] | None = "7a8b9c1d2e3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("GRANT INSERT ON loan_applications TO api_user")


def downgrade() -> None:
    op.execute("REVOKE INSERT ON loan_applications FROM api_user")
