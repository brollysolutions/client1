"""add loan_types + banks reference tables, seed loan_types

Revision ID: 1a2b3c4d5e6f
Revises: b6c7d8e9f0a1
Create Date: 2026-07-18 13:00:00.000000

Reference/config data for the loans line (master_erd.mermaid §LOANS LINE):
loan_type_id and bank_id are FK targets on the upcoming loan_applications table
(next migration). Both ship with no admin CRUD yet, so loan_types is seeded
here from the existing public product list (apps/web/lib/products.ts
LOAN_PRODUCTS) with deterministic uuid5 ids so the seed is reproducible across
environments without a DB round-trip to discover ids; banks ships empty.

Neither table carries business_line or client-owned data, so RLS is a trivial
USING (true) read policy — any authenticated api_user may read; only Admin
tooling (not built yet) will ever write these.

Rollback: drop policies, disable RLS, revoke grants, drop tables.
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "1a2b3c4d5e6f"
down_revision: str | Sequence[str] | None = "b6c7d8e9f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LOAN_TYPE_NAMESPACE = uuid.UUID("6e2a6b0e-6f2b-4b0a-9c1d-7c8f6a5b4d3e")

_LOAN_TYPE_SEED = [
    ("personal-loan", "Personal Loan"),
    ("business-loan", "Business Loan"),
    ("property-loan", "Property Loan"),
    ("vehicle-loan", "Vehicle Loan"),
    ("education-loan", "Education Loan"),
    ("credit-cards", "Credit Cards"),
    ("insurance", "Insurance"),
]


def _loan_type_id(name: str) -> uuid.UUID:
    return uuid.uuid5(_LOAN_TYPE_NAMESPACE, name)


def upgrade() -> None:
    op.create_table(
        "loan_types",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("custom_fields", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_loan_types")),
        sa.UniqueConstraint("name", name=op.f("uq_loan_types_name")),
    )

    op.create_table(
        "banks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("logo_key", sa.String(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_banks")),
    )

    for table in ("loan_types", "banks"):
        op.execute(f"GRANT SELECT ON {table} TO api_user")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY {table}_rls ON {table} FOR SELECT USING (true)")

    loan_types_table = sa.table(
        "loan_types",
        sa.column("id", sa.UUID()),
        sa.column("name", sa.String()),
        sa.column("label", sa.String()),
    )
    op.bulk_insert(
        loan_types_table,
        [
            {"id": _loan_type_id(name), "name": name, "label": label}
            for name, label in _LOAN_TYPE_SEED
        ],
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS banks_rls ON banks")
    op.execute("ALTER TABLE banks DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON banks FROM api_user")
    op.drop_table("banks")

    op.execute("DROP POLICY IF EXISTS loan_types_rls ON loan_types")
    op.execute("ALTER TABLE loan_types DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON loan_types FROM api_user")
    op.drop_table("loan_types")
