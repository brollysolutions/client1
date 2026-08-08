"""add explicit payout provider and manual-cheque lifecycle

Revision ID: e0f1a2b3c4d6
Revises: d0e1f2a3b4c5
Create Date: 2026-08-08 12:00:00.000000

FR-10.3 distinguishes the payout provider from the delivery destination and
adds the promised offline cheque rail. Existing VPA/bank rows are backfilled to
RazorpayX. Manual rows retain only a masked destination_hint plus an HMAC
fingerprint used to prevent reference reuse; the raw cheque reference never
reaches storage.

The existing admin-only RLS/grants remain unchanged. Provider-specific gateway
ids become unique per provider so a future adapter cannot collide with a
RazorpayX identifier. PostgreSQL cannot remove enum labels, so downgrade refuses
to discard live manual rows, removes the new schema, and leaves the harmless
additive payout_destination/audit_action labels in place.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e0f1a2b3c4d6"
down_revision: str | Sequence[str] | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_AUDIT_ACTIONS = (
    "payout_manual_issued",
    "payout_manual_cleared",
    "payout_manual_failed",
    "payout_manual_reversed",
)


def upgrade() -> None:
    # New enum labels must commit before constraints or writers can use them.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE payout_destination ADD VALUE IF NOT EXISTS 'cheque'")
        for action in _AUDIT_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")

    provider_enum = postgresql.ENUM("razorpayx", "manual", name="payout_provider")
    provider_enum.create(op.get_bind())

    op.add_column(
        "payouts",
        sa.Column(
            "provider",
            postgresql.ENUM("razorpayx", "manual", name="payout_provider", create_type=False),
            nullable=False,
            server_default="razorpayx",
        ),
    )
    op.add_column(
        "payouts", sa.Column("manual_reference_fingerprint", sa.String(64), nullable=True)
    )
    op.add_column(
        "payouts", sa.Column("manual_issued_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "payouts", sa.Column("manual_cleared_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.create_check_constraint(
        "ck_payouts_provider_destination",
        "payouts",
        "(provider = 'razorpayx' AND destination_type IN ('vpa','bank_account')) "
        "OR (provider = 'manual' AND destination_type = 'cheque')",
    )
    op.create_check_constraint(
        "ck_payouts_manual_fields_provider",
        "payouts",
        "provider = 'manual' OR (manual_reference_fingerprint IS NULL "
        "AND manual_issued_at IS NULL AND manual_cleared_at IS NULL)",
    )
    op.create_check_constraint(
        "ck_payouts_manual_clear_after_issue",
        "payouts",
        "manual_cleared_at IS NULL OR manual_issued_at IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_payouts_manual_no_gateway_ids",
        "payouts",
        "provider <> 'manual' OR (gateway_contact_id IS NULL "
        "AND gateway_fund_account_id IS NULL AND gateway_payout_id IS NULL)",
    )

    op.drop_index("uq_payouts_gateway_payout_id", table_name="payouts")
    op.create_index(
        "uq_payouts_provider_gateway_payout_id",
        "payouts",
        ["provider", "gateway_payout_id"],
        unique=True,
        postgresql_where=sa.text("gateway_payout_id IS NOT NULL"),
    )
    op.create_index(
        "uq_payouts_manual_reference",
        "payouts",
        ["manual_reference_fingerprint"],
        unique=True,
        postgresql_where=sa.text("manual_reference_fingerprint IS NOT NULL"),
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM payouts WHERE provider = 'manual') THEN
            RAISE EXCEPTION 'cannot downgrade while manual cheque payouts exist';
          END IF;
        END
        $$;
        """
    )
    op.drop_index("uq_payouts_manual_reference", table_name="payouts")
    op.drop_index("uq_payouts_provider_gateway_payout_id", table_name="payouts")
    op.create_index(
        "uq_payouts_gateway_payout_id",
        "payouts",
        ["gateway_payout_id"],
        unique=True,
        postgresql_where=sa.text("gateway_payout_id IS NOT NULL"),
    )
    op.drop_constraint("ck_payouts_manual_no_gateway_ids", "payouts", type_="check")
    op.drop_constraint("ck_payouts_manual_clear_after_issue", "payouts", type_="check")
    op.drop_constraint("ck_payouts_manual_fields_provider", "payouts", type_="check")
    op.drop_constraint("ck_payouts_provider_destination", "payouts", type_="check")
    op.drop_column("payouts", "manual_cleared_at")
    op.drop_column("payouts", "manual_issued_at")
    op.drop_column("payouts", "manual_reference_fingerprint")
    op.drop_column("payouts", "provider")
    postgresql.ENUM(name="payout_provider").drop(op.get_bind())
