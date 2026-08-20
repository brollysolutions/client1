"""replace profile postal address with location and salaried terminology

Revision ID: e4b5c6d7e8f9
Revises: d3a9b72c5e41
Create Date: 2026-08-20 11:00:00.000000

The optional identity profile no longer collects a postal address. Renaming the
existing column preserves user-supplied values as the new editable Location
field instead of deleting PII during deployment. Existing ``net_salary`` rows
are migrated to the requested ``salaried`` literal while retaining the income
group and owner/platform-Admin RLS invariants on ``auth_users``.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4b5c6d7e8f9"
down_revision: str | Sequence[str] | None = "d3a9b72c5e41"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "auth_users",
        "address",
        new_column_name="location",
        existing_type=sa.Text(),
        existing_nullable=True,
    )
    op.drop_constraint(
        op.f("ck_auth_users_profile_income_source_valid"),
        "auth_users",
        type_="check",
    )
    op.execute(
        "UPDATE auth_users SET income_source = 'salaried' WHERE income_source = 'net_salary'"
    )
    op.create_check_constraint(
        op.f("ck_auth_users_profile_income_source_valid"),
        "auth_users",
        "income_source IS NULL OR income_source IN ('salaried', 'business_income')",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_auth_users_profile_income_source_valid"),
        "auth_users",
        type_="check",
    )
    op.execute(
        "UPDATE auth_users SET income_source = 'net_salary' WHERE income_source = 'salaried'"
    )
    op.create_check_constraint(
        op.f("ck_auth_users_profile_income_source_valid"),
        "auth_users",
        "income_source IS NULL OR income_source IN ('net_salary', 'business_income')",
    )
    op.alter_column(
        "auth_users",
        "location",
        new_column_name="address",
        existing_type=sa.Text(),
        existing_nullable=True,
    )
