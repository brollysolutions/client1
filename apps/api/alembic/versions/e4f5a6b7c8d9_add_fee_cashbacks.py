"""add fee_cashbacks table + RLS (FR-6.6 processing-fee cashback)

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-29 10:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004).

`fee_cashbacks` is the per-loan-application cashback ledger (SRS v1.4 FR-6.6):
"the processing fee shall be either waived or returned to the lead as
cashback" on successful conversion. The *declaration* half of this already
existed (`loan_applications.processing_fee` + the `fee_outcome` enum,
`2b3c4d5e6f7a`); this migration adds the money-movement half. See
docs/specs/processing-fee-cashback.md for the full design.

Eligibility (services/fee_cashbacks.py::list_eligible_applications) is a
convenience only; create_fee_cashback re-validates all four conjuncts
server-side:
  disbursed_at IS NOT NULL AND fee_outcome = 'cashback' AND processing_fee > 0
  AND NOT EXISTS (a live fee_cashbacks row for this application)
`disbursed_at IS NOT NULL`, not `status == 'disbursed'`, for the identical
reason services/commissions.py's eligibility query documents: DISBURSED is not
a terminal loan status (TERMINAL_STATUSES = {CLOSED, REJECTED} in
services/loan_applications.py), so a loan that disburses and is later closed
must not silently and permanently lose cashback eligibility.

`processing_fee_paise` is a snapshot taken at cashback-entry time, not a live
read of `loan_applications.processing_fee` — a telecaller can still edit that
column afterwards (it stays writable at status >= SUBMITTED_TO_BANK), and the
cashback record must not silently track a number that changed after entry.
`ck_fee_cashbacks_amount_le_fee` enforces the one real domain invariant FR-6.6
gives us (a cashback can never exceed the fee actually charged) in the
database, not only in the entry schema.

The partial-unique index (`uq_fee_cashbacks_active_loan_application`) is the
authoritative double-entry guard, exactly mirroring
`uq_commissions_active_loan_application` (692dd51658bf): one live
(non-cancelled) cashback per loan application, ever. A cancelled row frees
the application for legitimate re-entry.

RLS: THREE per-command policies (the commissions/`audit_log` precedent) —
reading and writing this table are different rights.

  * `fee_cashbacks_select` — full Admin (role='admin' AND
    platform_scope='true') OR the owning CLIENT reading their own row
    (recipient_auth_user_uuid = app.auth_user_uuid). Deliberately NO
    `AND business_line = app.business_line` clause on the owner branch —
    unlike a commission's agent (single-line by definition,
    AgentProfile.business_line is NOT NULL), a cashback's recipient is a
    CLIENT, whose `app.business_line` JWT claim is literally `"both"` for
    every self-registered account (auth_service._build_access_claims).
    ANDing the line predicate in would make the client's own row invisible
    to them — the identical carve-out `2b3c4d5e6f7a`'s docstring already
    records for `loan_applications` itself.
  * `fee_cashbacks_insert` / `fee_cashbacks_update` — full Admin only. Admin
    verifies internal completeness and enters the amount; the client can
    never write their own row even by accident (their branch above is
    SELECT-only, not FOR ALL).

`api_user` gets SELECT, INSERT, UPDATE — never DELETE. Cancellation is a
status flip (services/fee_cashbacks.py::cancel_fee_cashback), so a cashback
record is never destroyed.

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop
indexes + table (CASCADE via drop_table), drop the enum. The shared trigger
FUNCTION (enforce_business_line_immutable) is not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | Sequence[str] | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"
_STATUS_VALUES = ("pending", "paid", "cancelled")

# Full Admin bypasses the line filter, same shape as every other admin_all
# branch. The client's own-row branch keys ONLY on identity — see the module
# docstring for why no business_line predicate belongs here.
_SELECT_PREDICATE = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
    OR recipient_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
"""

_ADMIN_ONLY_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""


def upgrade() -> None:
    bind = op.get_bind()

    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="fee_cashback_status")
    status_enum.create(bind)

    op.create_table(
        "fee_cashbacks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("loan_application_uuid", sa.UUID(), nullable=False),
        sa.Column("client_profile_uuid", sa.UUID(), nullable=False),
        sa.Column("recipient_auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("processing_fee_paise", sa.BigInteger(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="fee_cashback_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("payout_uuid", sa.UUID(), nullable=True),
        sa.Column("payout_txn_uuid", sa.UUID(), nullable=True),
        sa.Column("entered_by_uuid", sa.UUID(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("cancelled_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["loan_application_uuid"],
            ["loan_applications.id"],
            name=op.f("fk_fee_cashbacks_loan_application_uuid_loan_applications"),
        ),
        sa.ForeignKeyConstraint(
            ["client_profile_uuid"],
            ["client_profiles.id"],
            name=op.f("fk_fee_cashbacks_client_profile_uuid_client_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["recipient_auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_fee_cashbacks_recipient_auth_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["payout_uuid"],
            ["payouts.id"],
            name=op.f("fk_fee_cashbacks_payout_uuid_payouts"),
        ),
        sa.ForeignKeyConstraint(
            ["payout_txn_uuid"],
            ["transactions.id"],
            name=op.f("fk_fee_cashbacks_payout_txn_uuid_transactions"),
        ),
        sa.ForeignKeyConstraint(
            ["entered_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_fee_cashbacks_entered_by_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fee_cashbacks")),
        sa.CheckConstraint(
            "amount_paise > 0 AND amount_paise <= 10000000000",
            name=op.f("ck_fee_cashbacks_amount_range"),
        ),
        # The one real domain invariant FR-6.6 gives us: a cashback can never
        # exceed the fee actually charged. Enforced in the DB, not only in
        # the entry schema, so a future direct-SQL path can't violate it.
        sa.CheckConstraint(
            "amount_paise <= processing_fee_paise",
            name=op.f("ck_fee_cashbacks_amount_le_fee"),
        ),
    )

    op.create_index(
        "ix_fee_cashbacks_recipient_auth_user_uuid", "fee_cashbacks", ["recipient_auth_user_uuid"]
    )
    op.create_index("ix_fee_cashbacks_status", "fee_cashbacks", ["status"])
    op.create_index(
        "uq_fee_cashbacks_active_loan_application",
        "fee_cashbacks",
        ["loan_application_uuid"],
        unique=True,
        postgresql_where=sa.text("status <> 'cancelled'"),
    )

    op.execute(
        f"CREATE TRIGGER trg_fee_cashbacks_business_line_immutable "
        f"BEFORE UPDATE ON fee_cashbacks "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE ON fee_cashbacks TO api_user")
    op.execute("ALTER TABLE fee_cashbacks ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY fee_cashbacks_select ON fee_cashbacks
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY fee_cashbacks_insert ON fee_cashbacks
        FOR INSERT
        WITH CHECK ({_ADMIN_ONLY_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY fee_cashbacks_update ON fee_cashbacks
        FOR UPDATE
        USING ({_ADMIN_ONLY_PREDICATE})
        WITH CHECK ({_ADMIN_ONLY_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS fee_cashbacks_update ON fee_cashbacks")
    op.execute("DROP POLICY IF EXISTS fee_cashbacks_insert ON fee_cashbacks")
    op.execute("DROP POLICY IF EXISTS fee_cashbacks_select ON fee_cashbacks")
    op.execute("ALTER TABLE fee_cashbacks DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON fee_cashbacks FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_fee_cashbacks_business_line_immutable ON fee_cashbacks")
    op.drop_index("uq_fee_cashbacks_active_loan_application", table_name="fee_cashbacks")
    op.drop_index("ix_fee_cashbacks_status", table_name="fee_cashbacks")
    op.drop_index("ix_fee_cashbacks_recipient_auth_user_uuid", table_name="fee_cashbacks")
    op.drop_table("fee_cashbacks")
    postgresql.ENUM(name="fee_cashback_status").drop(op.get_bind())
