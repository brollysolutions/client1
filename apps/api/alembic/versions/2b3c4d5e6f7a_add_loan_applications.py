"""add loan_applications table + enums + RLS

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2026-07-18 13:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

loan_applications is the client-visible loan journey (loans line only), per
docs/architecture/Client_Dashboard_System_Design.md §4.1/§5.2. status is a
distinct axis from leads.status (internal lead-ownership, never shown to the
client). No repayment-schedule/EMI fields here by design — the partner bank
owns that ledger; this table carries deal terms only.

RLS mirrors the leads_rls shape from migration 8b2d3c4e5f6a: the client-owned
branch keys on client_profile_uuid ALONE, no business_line predicate. This
deviates from the Client_Dashboard_System_Design.md §8 snippet (which ANDs in
business_line), for a concrete reason discovered while testing: a
self-registered client always holds client_profiles rows for BOTH lines
(auth_service._build_access_claims), so their JWT's business_line claim is
literally the string "both", never "loans" — a business_line::text equality
check on the client branch would always be false and lock the client out of
their own row. client_profile_uuid already uniquely identifies the line (each
client_profiles row has exactly one business_line), so it alone is sufficient
and correct — FOR THIS TABLE, because it is loans-only.

CAUTION before copying this exact predicate onto a real-estate-owned table
(e.g. a future property_inquiries policy): _build_access_claims puts only
ONE client_profile_uuid in the JWT, chosen deterministically as the
alphabetically-first line ("loans" < "real_estate"), regardless of which
line the user is actively viewing. That happens to be the loans profile,
which is exactly what this table needs — but it means a dual-line client's
JWT NEVER carries their real_estate client_profile_uuid. Reusing
`client_profile_uuid::text = current_setting('app.client_profile_uuid')`
verbatim on a real-estate table would silently return zero rows for every
dual-line client. Fix that properly (line-aware claims, or a per-line
token) before this pattern gets copied a second time.

Ships with WITH CHECK identical to USING from day one to avoid a repeat of
the leads "D1" bug (d4a1b2c3e5f6) where a narrower WITH CHECK silently
blocked legitimate line-staff writes. Only SELECT is GRANTed in this
migration: no write endpoint exists yet (no staff/telecaller workflow to
create or advance a loan_applications row), so INSERT/UPDATE grants land in
that follow-up migration instead of sitting unused now.

Rollback: drop policy, disable RLS, revoke grant, drop table (drops indexes),
drop enums.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "2b3c4d5e6f7a"
down_revision: str | Sequence[str] | None = "1a2b3c4d5e6f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LOAN_STATUS_VALUES = (
    "new",
    "assigned",
    "contacted",
    "docs_collected",
    "submitted_to_bank",
    "sanctioned",
    "disbursed",
    "closed",
    "rejected",
    "on_hold",
)
_FEE_OUTCOME_VALUES = ("waived", "cashback", "none")

# One active loan journey per Loan profile (Client_Dashboard_System_Design.md
# §9 Locked #2) — verbatim predicate from the spec.
_ACTIVE_PREDICATE = "status NOT IN ('closed', 'rejected')"

_RLS_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
    )
"""


def upgrade() -> None:
    bind = op.get_bind()

    loan_status = postgresql.ENUM(*_LOAN_STATUS_VALUES, name="loan_status")
    loan_status.create(bind)
    fee_outcome = postgresql.ENUM(*_FEE_OUTCOME_VALUES, name="fee_outcome")
    fee_outcome.create(bind)

    op.create_table(
        "loan_applications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lead_uuid", sa.UUID(), nullable=False),
        sa.Column("client_profile_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("loan_type_id", sa.UUID(), nullable=False),
        sa.Column("bank_id", sa.UUID(), nullable=True),
        sa.Column("amount_requested", sa.Numeric(14, 2), nullable=True),
        sa.Column("amount_sanctioned", sa.Numeric(14, 2), nullable=True),
        sa.Column("interest_rate", sa.Numeric(6, 3), nullable=True),
        sa.Column("processing_fee", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "fee_outcome",
            postgresql.ENUM(*_FEE_OUTCOME_VALUES, name="fee_outcome", create_type=False),
            nullable=True,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*_LOAN_STATUS_VALUES, name="loan_status", create_type=False),
            nullable=False,
            server_default="new",
        ),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["lead_uuid"],
            ["leads.id"],
            name=op.f("fk_loan_applications_lead_uuid_leads"),
        ),
        sa.ForeignKeyConstraint(
            ["client_profile_uuid"],
            ["client_profiles.id"],
            name=op.f("fk_loan_applications_client_profile_uuid_client_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["loan_type_id"],
            ["loan_types.id"],
            name=op.f("fk_loan_applications_loan_type_id_loan_types"),
        ),
        sa.ForeignKeyConstraint(
            ["bank_id"],
            ["banks.id"],
            name=op.f("fk_loan_applications_bank_id_banks"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_loan_applications")),
    )
    op.create_index(
        op.f("ix_loan_applications_client_profile_uuid"),
        "loan_applications",
        ["client_profile_uuid"],
    )
    op.create_index(
        "uq_loan_applications_client_profile_active",
        "loan_applications",
        ["client_profile_uuid"],
        unique=True,
        postgresql_where=sa.text(_ACTIVE_PREDICATE),
    )

    op.execute("GRANT SELECT ON loan_applications TO api_user")
    op.execute("ALTER TABLE loan_applications ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY loan_applications_rls ON loan_applications
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS loan_applications_rls ON loan_applications")
    op.execute("ALTER TABLE loan_applications DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON loan_applications FROM api_user")
    op.drop_table("loan_applications")
    postgresql.ENUM(name="fee_outcome").drop(op.get_bind())
    postgresql.ENUM(name="loan_status").drop(op.get_bind())
