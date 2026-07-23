"""add loan_txn_history table + RLS

Revision ID: a1b2c3d4e5f6
Revises: f7d8c9a0b1e2
Create Date: 2026-07-23 09:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy + trigger require a direct connection — ADR-0004).

loan_txn_history is the telecaller's manual entry of bank/rate/date terms on a
progressing loan (Telecaller_Dashboard_System_Design.md §5.2/§6.3, FR-6.5) —
loans line only. Each row is an immutable entry record (no UPDATE/DELETE
grant — same posture as lead_activities): a correction is a new row, not an
edit. business_line is stamped from the parent loan_application and immutable
via the shared enforce_business_line_immutable() trigger (e5f6a7b8c9d0).

RLS has three branches:
  1. platform bypass
  2. telecaller — line match AND an EXISTS join through loan_applications ->
     leads confirming the lead is assigned to them. This subquery itself runs
     under the querying role's RLS: loan_applications_rls (2b3c4d5e6f7a) already
     grants any same-line telecaller/employee/sub_admin whole-line SELECT, so
     the real narrowing comes from leads_rls (e6c7b8f9a0d1), which restricts a
     telecaller to only their own assigned leads. A future narrowing of either
     policy changes what this table exposes — see test_loan_txn_history_rls.py.
  3. client-own — via loan_applications.client_profile_uuid. Safe here because
     this table is loans-only and a dual-line client's JWT always carries their
     loans-line client_profile_uuid (2b3c4d5e6f7a's docstring) — do NOT copy
     this branch onto a real-estate-owned table.

Rollback: drop policy, disable RLS, revoke grant, drop trigger, drop indexes,
drop table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "f7d8c9a0b1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"

_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND EXISTS (
            SELECT 1 FROM loan_applications la
            JOIN leads l ON l.id = la.lead_uuid
            WHERE la.id = loan_txn_history.loan_application_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
    OR (
        current_setting('app.client_profile_uuid', true) <> ''
        AND EXISTS (
            SELECT 1 FROM loan_applications la
            WHERE la.id = loan_txn_history.loan_application_uuid
              AND la.client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
        )
    )
"""


def upgrade() -> None:
    op.create_table(
        "loan_txn_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("loan_application_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("bank_name", sa.Text(), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("interest_rate", sa.Numeric(6, 3), nullable=True),
        sa.Column("txn_date", sa.Date(), nullable=True),
        sa.Column("entered_by_staff_profile_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["loan_application_uuid"],
            ["loan_applications.id"],
            name=op.f("fk_loan_txn_history_loan_application_uuid_loan_applications"),
        ),
        sa.ForeignKeyConstraint(
            ["entered_by_staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_loan_txn_history_entered_by_staff_profile_uuid_staff_profiles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_loan_txn_history")),
    )
    op.create_index(
        op.f("ix_loan_txn_history_loan_application_uuid"),
        "loan_txn_history",
        ["loan_application_uuid"],
    )
    op.create_index(
        op.f("ix_loan_txn_history_entered_by_staff_profile_uuid"),
        "loan_txn_history",
        ["entered_by_staff_profile_uuid"],
    )

    op.execute(
        f"CREATE TRIGGER trg_loan_txn_history_business_line_immutable "
        f"BEFORE UPDATE ON loan_txn_history "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    # No UPDATE/DELETE grant: an entered txn is an immutable record.
    op.execute("GRANT SELECT, INSERT ON loan_txn_history TO api_user")
    op.execute("ALTER TABLE loan_txn_history ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY loan_txn_history_rls ON loan_txn_history
        FOR ALL
        USING ({_PREDICATE})
        WITH CHECK ({_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS loan_txn_history_rls ON loan_txn_history")
    op.execute("ALTER TABLE loan_txn_history DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON loan_txn_history FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_loan_txn_history_business_line_immutable ON loan_txn_history"
    )
    op.drop_index(
        op.f("ix_loan_txn_history_entered_by_staff_profile_uuid"),
        table_name="loan_txn_history",
    )
    op.drop_index(op.f("ix_loan_txn_history_loan_application_uuid"), table_name="loan_txn_history")
    op.drop_table("loan_txn_history")
