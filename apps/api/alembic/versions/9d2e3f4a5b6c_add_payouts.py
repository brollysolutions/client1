"""add payouts table + enums + RLS

Revision ID: 9d2e3f4a5b6c
Revises: 8b9c1d2e3f4a
Create Date: 2026-07-22 02:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

payouts is the ADMIN-ONLY workflow for disbursing cashback / referral_bonus /
commission money via RazorpayX (the payment gateway is for these payouts only,
never loan principal or property purchase, per the money invariant). It is a
sidecar to `transactions`, NOT an extension: `transactions` stays the generic,
recipient-owned, immutable client ledger; on a successful settle the payout
service emits ONE `transactions` row on a bypass session and stores its id in
payouts.ledger_transaction_id (idempotent vs webhook redelivery).

RLS is admin-only: platform_scope='true' (Admin / Sub Admin) can see all rows;
clients, agents and line staff see NONE (the maker/checker/gateway machinery is
never exposed to the recipient). Deliberately keyed on platform_scope, NOT
client_profile_uuid (the JWT single-claim gap).

All writes (create / approve / reject / webhook-settle) run on the app-superuser
bypass session, which bypasses grants and RLS, so only SELECT is granted to
api_user — the admin list endpoint reads through the RLS-scoped request session.

Raw UPI VPA / bank account is NEVER stored (handed to RazorpayX only); only
gateway ids and a masked destination_hint are persisted.

Money is BIGINT minor units (amount_paise).

WITH CHECK is identical to USING from day one (leads "D1" lesson, d4a1b2c3e5f6).

Rollback: drop policy, disable RLS, revoke grant, drop table (drops indexes),
drop enums. Additive-only — no data backfill / contract step.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "9d2e3f4a5b6c"
down_revision: str | Sequence[str] | None = "8b9c1d2e3f4a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TYPE_VALUES = ("cashback", "referral_bonus", "commission")
_STATUS_VALUES = (
    "pending_approval",
    "approved",
    "rejected",
    "initiated",
    "processing",
    "paid",
    "failed",
    "reversed",
)
_DESTINATION_VALUES = ("vpa", "bank_account")

# Admin-only: platform Admin / Sub Admin see all; everyone else sees nothing.
# No owner branch, no line/staff branch — the recipient must not see the workflow.
_RLS_PREDICATE = "current_setting('app.platform_scope', true) = 'true'"

# Terminal-dead states free the idempotency key for a legitimate retry.
_IDEM_ACTIVE_WHERE = "status NOT IN ('rejected','failed','reversed')"


def upgrade() -> None:
    bind = op.get_bind()

    type_enum = postgresql.ENUM(*_TYPE_VALUES, name="payout_type")
    type_enum.create(bind)
    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="payout_status")
    status_enum.create(bind)
    destination_enum = postgresql.ENUM(*_DESTINATION_VALUES, name="payout_destination")
    destination_enum.create(bind)

    op.create_table(
        "payouts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("recipient_user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=True,
        ),
        sa.Column(
            "type",
            postgresql.ENUM(*_TYPE_VALUES, name="payout_type", create_type=False),
            nullable=False,
        ),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="payout_status", create_type=False),
            nullable=False,
            server_default="pending_approval",
        ),
        sa.Column(
            "destination_type",
            postgresql.ENUM(*_DESTINATION_VALUES, name="payout_destination", create_type=False),
            nullable=False,
        ),
        sa.Column("destination_hint", sa.String(length=40), nullable=False),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("maker_user_uuid", sa.UUID(), nullable=False),
        sa.Column("checker_user_uuid", sa.UUID(), nullable=True),
        sa.Column("rejected_by_user_uuid", sa.UUID(), nullable=True),
        sa.Column("reject_reason", sa.String(length=200), nullable=True),
        sa.Column("gateway_contact_id", sa.String(length=64), nullable=True),
        sa.Column("gateway_fund_account_id", sa.String(length=64), nullable=True),
        sa.Column("gateway_payout_id", sa.String(length=64), nullable=True),
        sa.Column("gateway_status", sa.String(length=40), nullable=True),
        sa.Column("failure_reason", sa.String(length=200), nullable=True),
        sa.Column("ledger_transaction_id", sa.UUID(), nullable=True),
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
            ["recipient_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_payouts_recipient_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["maker_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_payouts_maker_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["checker_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_payouts_checker_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["rejected_by_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_payouts_rejected_by_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["ledger_transaction_id"],
            ["transactions.id"],
            name=op.f("fk_payouts_ledger_transaction_id_transactions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payouts")),
    )
    op.create_index(
        op.f("ix_payouts_status_created_at"),
        "payouts",
        ["status", "created_at"],
    )
    op.create_index(
        op.f("ix_payouts_recipient_user_uuid"),
        "payouts",
        ["recipient_user_uuid"],
    )
    # Dedupe guard: one active payout per (recipient, type, amount, idem key).
    op.create_index(
        "uq_payouts_idem_active",
        "payouts",
        ["recipient_user_uuid", "type", "amount_paise", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text(_IDEM_ACTIVE_WHERE),
    )

    op.execute("GRANT SELECT ON payouts TO api_user")
    op.execute("ALTER TABLE payouts ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY payouts_rls ON payouts
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS payouts_rls ON payouts")
    op.execute("ALTER TABLE payouts DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON payouts FROM api_user")
    op.drop_table("payouts")
    postgresql.ENUM(name="payout_destination").drop(op.get_bind())
    postgresql.ENUM(name="payout_status").drop(op.get_bind())
    postgresql.ENUM(name="payout_type").drop(op.get_bind())
