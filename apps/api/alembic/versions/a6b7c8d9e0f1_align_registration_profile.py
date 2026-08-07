"""align optional registration email and profile details

Revision ID: a6b7c8d9e0f1
Revises: f4a5b6c7d8e9
Create Date: 2026-08-07 00:00:00.000000

Email becomes nullable for ordinary mobile-first Client registration while its
existing unique constraint continues to protect supplied values. The added
profile fields are identity-wide, owner/Admin protected by the existing
``auth_users_rls`` policy, and nullable so no legacy backfill or completion gate
is introduced.

Downgrade restores the historical NOT NULL email invariant after assigning a
unique non-deliverable placeholder to any mobile-only accounts created while
this revision was active.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: str | Sequence[str] | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("auth_users", "email", existing_type=sa.String(), nullable=True)
    op.add_column("auth_users", sa.Column("gender", sa.String(length=32), nullable=True))
    op.add_column(
        "auth_users",
        sa.Column("gender_self_description", sa.String(length=100), nullable=True),
    )
    op.add_column("auth_users", sa.Column("income_source", sa.String(length=32), nullable=True))
    op.add_column("auth_users", sa.Column("income_amount_minor", sa.BigInteger(), nullable=True))
    op.add_column("auth_users", sa.Column("income_period", sa.String(length=16), nullable=True))
    op.add_column("auth_users", sa.Column("occupation", sa.String(length=120), nullable=True))
    op.add_column("auth_users", sa.Column("address", sa.Text(), nullable=True))

    op.create_check_constraint(
        op.f("ck_auth_users_profile_gender_valid"),
        "auth_users",
        "gender IS NULL OR gender IN "
        "('female', 'male', 'non_binary', 'self_described', 'prefer_not_to_say')",
    )
    op.create_check_constraint(
        op.f("ck_auth_users_profile_gender_description_consistent"),
        "auth_users",
        "(gender = 'self_described' AND gender_self_description IS NOT NULL) OR "
        "(gender IS DISTINCT FROM 'self_described' AND gender_self_description IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_auth_users_profile_income_source_valid"),
        "auth_users",
        "income_source IS NULL OR income_source IN ('net_salary', 'business_income')",
    )
    op.create_check_constraint(
        op.f("ck_auth_users_profile_income_period_valid"),
        "auth_users",
        "income_period IS NULL OR income_period IN ('monthly', 'annual')",
    )
    op.create_check_constraint(
        op.f("ck_auth_users_profile_income_group_consistent"),
        "auth_users",
        "(income_source IS NULL AND income_amount_minor IS NULL AND income_period IS NULL) OR "
        "(income_source IS NOT NULL AND income_amount_minor IS NOT NULL "
        "AND income_period IS NOT NULL)",
    )
    op.create_check_constraint(
        op.f("ck_auth_users_profile_income_amount_valid"),
        "auth_users",
        "income_amount_minor IS NULL OR income_amount_minor BETWEEN 1 AND 1000000000000",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_auth_users_profile_income_amount_valid"), "auth_users", type_="check"
    )
    op.drop_constraint(
        op.f("ck_auth_users_profile_income_group_consistent"), "auth_users", type_="check"
    )
    op.drop_constraint(
        op.f("ck_auth_users_profile_income_period_valid"), "auth_users", type_="check"
    )
    op.drop_constraint(
        op.f("ck_auth_users_profile_income_source_valid"), "auth_users", type_="check"
    )
    op.drop_constraint(
        op.f("ck_auth_users_profile_gender_description_consistent"),
        "auth_users",
        type_="check",
    )
    op.drop_constraint(op.f("ck_auth_users_profile_gender_valid"), "auth_users", type_="check")

    op.drop_column("auth_users", "address")
    op.drop_column("auth_users", "occupation")
    op.drop_column("auth_users", "income_period")
    op.drop_column("auth_users", "income_amount_minor")
    op.drop_column("auth_users", "income_source")
    op.drop_column("auth_users", "gender_self_description")
    op.drop_column("auth_users", "gender")

    op.execute(
        "UPDATE auth_users "
        "SET email = 'noemail+' || id::text || '@placeholder.invalid' "
        "WHERE email IS NULL"
    )
    op.alter_column("auth_users", "email", existing_type=sa.String(), nullable=False)
