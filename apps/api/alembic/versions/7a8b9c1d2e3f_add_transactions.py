"""add transactions table + enums + RLS

Revision ID: 7a8b9c1d2e3f
Revises: 6f7a8b9c1d2e
Create Date: 2026-07-21 02:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

transactions is an account-level payout LEDGER (cashback / referral_bonus /
commission — the payment gateway is for these payouts only, never loan
principal or property purchase, per the product's money invariant).
Identity-level owner (support_tickets/notifications shape): RLS keys on
app.auth_user_uuid, deliberately NOT client_profile_uuid — commission payouts
go to AGENTS, not clients, so the owner must be the account identity.

business_line is NULLABLE PROVENANCE (null = platform-level e.g. referral,
"loans"/"real_estate" = the originating line), not an access axis: no RLS
branch reads it, so unlike enquiries/bookmarks this column is NOT wrapped in
the enforce_business_line_immutable trigger — it isn't RLS-load-bearing and
there is no client write path to guard.

No producers exist yet (the money layer / Razorpay integration is a separate
milestone), so this table ships EMPTY in production. Only SELECT is granted
to api_user (read-only for the client/agent); a future producer inserts on a
bypass session (the app superuser, which bypasses grants entirely), the same
mechanism services.notifications.emit_notification already uses.

Money is BIGINT minor units (amount_paise), never a float or Numeric string.

WITH CHECK is identical to USING from day one (leads "D1" lesson,
d4a1b2c3e5f6) for consistency, even though api_user never writes.

Rollback: drop policy, disable RLS, revoke grant, drop table (drops
indexes), drop enums.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "7a8b9c1d2e3f"
down_revision: str | Sequence[str] | None = "6f7a8b9c1d2e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TYPE_VALUES = ("cashback", "referral_bonus", "commission")
_STATUS_VALUES = ("pending", "processing", "paid", "failed")

# Identity-level owner predicate only (support_tickets/notifications shape):
# own transactions, or platform Admin/Sub Admin. No business_line/staff branch.
_RLS_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()

    type_enum = postgresql.ENUM(*_TYPE_VALUES, name="transaction_type")
    type_enum.create(bind)
    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="transaction_status")
    status_enum.create(bind)

    op.create_table(
        "transactions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=True,
        ),
        sa.Column(
            "type",
            postgresql.ENUM(*_TYPE_VALUES, name="transaction_type", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="transaction_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("description", sa.String(length=200), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=True),
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
            ["user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_transactions_user_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transactions")),
    )
    op.create_index(
        op.f("ix_transactions_user_uuid_created_at"),
        "transactions",
        ["user_uuid", "created_at"],
    )

    op.execute("GRANT SELECT ON transactions TO api_user")
    op.execute("ALTER TABLE transactions ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY transactions_rls ON transactions
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS transactions_rls ON transactions")
    op.execute("ALTER TABLE transactions DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON transactions FROM api_user")
    op.drop_table("transactions")
    postgresql.ENUM(name="transaction_status").drop(op.get_bind())
    postgresql.ENUM(name="transaction_type").drop(op.get_bind())
