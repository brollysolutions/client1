"""add referral_codes and referrals tables + RLS (referral program, PR 1)

Revision ID: 9f8e7d6c5b4a
Revises: d8e9f0a1b2c3
Create Date: 2026-07-27 12:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004).

Two tables, shipped together (they share the new referral_status enum and
neither is useful alone):

`referral_codes` — one code per auth_user (Client_Dashboard_System_Design.md
§5.7 locks this for MVP), PK *is* the auth_user_uuid, which is the constraint.
No business_line column, so no immutability trigger — the code is issued
once, at signup, before the client has picked a line.

`referrals` — the referrer→referred edge + conversion/accrual state. Deviates
from master_erd.mermaid in two ways (see docs/specs/referral-program.md D13):

  - `business_line` is NULLABLE, not NOT NULL. Unknown at signup time (the
    referred person hasn't applied for a loan or a property yet); set exactly
    once at conversion. The shared enforce_business_line_immutable() trigger
    already permits the first NULL -> value assignment (e5f6a7b8c9d0), which
    is exactly this shape.
  - Adds `referred_auth_user_uuid` (nullable, set once the referred mobile
    registers) so the conversion hook — which fires on every loan disbursal
    and every property-deal close — is one indexed UUID lookup instead of an
    exact-match join on the PII text column `referred_mobile`.

Identity-keyed RLS (transactions/notifications shape, 7a8b9c1d2e3f), NOT
client_profile_uuid: the JWT carries only the alphabetically-first line's
client_profile_uuid claim, so a direct-equality predicate on that column
silently returns zero rows for every dual-line client (documented gap,
d6e7f8a9b0c1:33-43). One code per auth_user makes identity the correct axis
here regardless.

FR-9.5 (SRS v1.4 §4.8): Sub Admin manages referral-BONUS RULES only
(referral_bonus_config, f9a0b1c2d3e4) and has no reach into referral
activity itself — Admin traces it. So there is deliberately NO sub_admin
branch in either policy below; platform bypass is narrowed to role='admin'.
The referred person is also deliberately NOT given read access — only the
referrer (who shared the code) and Admin can see a `referrals` row.

`GRANT SELECT` only on both tables (D16): all writes (code issuance,
signup attribution, conversion accrual) run on the bypass session as the
app superuser, which does not need a grant. api_user cannot corrupt this
money-adjacent state even with an app-layer bug.

`uq_referrals_converted_ref` is the idempotency backstop: one loan
application or one property deal can credit at most one referral row, ever,
even across a manual DB fix — see services/referrals.py::record_conversion
for the compare-and-swap that is the primary idempotency guard.

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop
tables (drops indexes + FKs), drop the enum. The shared trigger FUNCTION is
not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "9f8e7d6c5b4a"
down_revision: str | Sequence[str] | None = "d8e9f0a1b2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"
_STATUS_VALUES = ("pending", "converted", "accrued", "paid", "void")

# Identity-keyed (transactions shape, 7a8b9c1d2e3f). Platform bypass narrowed
# to role='admin' (no sub_admin branch — FR-9.5). WITH CHECK is byte-identical
# to USING from day one (leads "D1" lesson, d4a1b2c3e5f6).
_CODES_PREDICATE = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
"""

_REFERRALS_PREDICATE = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
    OR referrer_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()

    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="referral_status")
    status_enum.create(bind)

    # -- referral_codes ------------------------------------------------------
    op.create_table(
        "referral_codes",
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_referral_codes_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("auth_user_uuid", name=op.f("pk_referral_codes")),
        sa.UniqueConstraint("code", name=op.f("uq_referral_codes_code")),
        sa.CheckConstraint(
            "code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'",
            name=op.f("ck_referral_codes_code_format"),
        ),
    )

    op.execute("GRANT SELECT ON referral_codes TO api_user")
    op.execute("ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY referral_codes_rls ON referral_codes
        FOR ALL
        USING ({_CODES_PREDICATE})
        WITH CHECK ({_CODES_PREDICATE});
        """
    )

    # -- referrals -------------------------------------------------------------
    op.create_table(
        "referrals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("referrer_auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("referred_mobile", sa.Text(), nullable=False),
        sa.Column("referred_auth_user_uuid", sa.UUID(), nullable=True),
        sa.Column("referred_lead_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=True,
        ),
        sa.Column(
            "conversion_status",
            postgresql.ENUM(*_STATUS_VALUES, name="referral_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("converted_ref_type", sa.Text(), nullable=True),
        sa.Column("converted_ref_uuid", sa.UUID(), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bonus_config_uuid", sa.UUID(), nullable=True),
        sa.Column("bonus_amount_paise", sa.BigInteger(), nullable=True),
        sa.Column("accrual_reason", sa.Text(), nullable=True),
        sa.Column("reward_txn_uuid", sa.UUID(), nullable=True),
        sa.Column("reward_payout_uuid", sa.UUID(), nullable=True),
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
            ["referrer_auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_referrals_referrer_auth_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["referred_auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_referrals_referred_auth_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["referred_lead_uuid"],
            ["leads.id"],
            name=op.f("fk_referrals_referred_lead_uuid_leads"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["bonus_config_uuid"],
            ["referral_bonus_config.id"],
            name=op.f("fk_referrals_bonus_config_uuid_referral_bonus_config"),
        ),
        sa.ForeignKeyConstraint(
            ["reward_txn_uuid"],
            ["transactions.id"],
            name=op.f("fk_referrals_reward_txn_uuid_transactions"),
        ),
        sa.ForeignKeyConstraint(
            ["reward_payout_uuid"],
            ["payouts.id"],
            name=op.f("fk_referrals_reward_payout_uuid_payouts"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_referrals")),
        sa.UniqueConstraint("referred_mobile", name=op.f("uq_referrals_referred_mobile")),
    )
    op.create_index(
        op.f("ix_referrals_referrer_auth_user_uuid_created_at"),
        "referrals",
        ["referrer_auth_user_uuid", "created_at"],
    )
    op.create_index(
        op.f("ix_referrals_referred_auth_user_uuid"), "referrals", ["referred_auth_user_uuid"]
    )
    op.create_index(op.f("ix_referrals_conversion_status"), "referrals", ["conversion_status"])
    # Idempotency backstop: one loan application / property deal credits at
    # most one referral, ever.
    op.create_index(
        "uq_referrals_converted_ref",
        "referrals",
        ["converted_ref_type", "converted_ref_uuid"],
        unique=True,
        postgresql_where=sa.text("converted_ref_uuid IS NOT NULL"),
    )

    op.execute(
        f"CREATE TRIGGER trg_referrals_business_line_immutable "
        f"BEFORE UPDATE ON referrals "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT ON referrals TO api_user")
    op.execute("ALTER TABLE referrals ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY referrals_rls ON referrals
        FOR ALL
        USING ({_REFERRALS_PREDICATE})
        WITH CHECK ({_REFERRALS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS referrals_rls ON referrals")
    op.execute("ALTER TABLE referrals DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON referrals FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_referrals_business_line_immutable ON referrals")
    op.drop_index("uq_referrals_converted_ref", table_name="referrals")
    op.drop_index(op.f("ix_referrals_conversion_status"), table_name="referrals")
    op.drop_index(op.f("ix_referrals_referred_auth_user_uuid"), table_name="referrals")
    op.drop_index(op.f("ix_referrals_referrer_auth_user_uuid_created_at"), table_name="referrals")
    op.drop_table("referrals")

    op.execute("DROP POLICY IF EXISTS referral_codes_rls ON referral_codes")
    op.execute("ALTER TABLE referral_codes DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON referral_codes FROM api_user")
    op.drop_table("referral_codes")

    postgresql.ENUM(name="referral_status").drop(op.get_bind())
