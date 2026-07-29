"""add commissions table + RLS (agent-commission entry, PR 1)

Revision ID: 692dd51658bf
Revises: 9af869604ca2
Create Date: 2026-07-29 09:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004).

`commissions` is the per-deal agent commission ledger (SRS v1.4 FR-8.1/8.2,
IDR v1.4 §5.5): no fixed rate, Admin manually records the agreed amount per
agent per deal. See docs/specs/agent-commission.md for the full design and
its three deviations from master_erd.mermaid (property_deal_uuid over the
never-built property_inquiry_uuid; agreed_amount_paise over NUMERIC;
pending/paid/cancelled over the ERD's four-state machine — details in the
model docstring, app/models/commission.py).

Exactly-one-deal-ref is a CHECK constraint (loans XOR property), matching the
ERD. The two partial-unique indexes below are the real double-entry guard —
one live (non-cancelled) commission per deal, ever — deliberately in the DB
rather than only in a service pre-check, mirroring
`uq_loan_applications_active_user` (2b3c4d5e6f7a) and
`uq_referrals_converted_ref` (9f8e7d6c5b4a): a cancelled row frees the deal
for legitimate re-entry, which is exactly what "WHERE status <> 'cancelled'"
expresses and a plain UNIQUE constraint could not.

RLS: THREE per-command policies, not one FOR ALL (the audit_log precedent,
a1c4e77b93d2) — reading and writing this table are different rights.

  * `commissions_select` — full Admin (role='admin' AND platform_scope='true')
    OR the owning agent reading their own line's rows
    (agent_auth_user_uuid = app.auth_user_uuid AND business_line =
    app.business_line). Sub Admin is deliberately excluded: IDR §5.5 restricts
    ENTRY to Admin and the spec names no Sub Admin reading counterpart, same
    reasoning `audit_log_select` used to exclude Sub Admin from a table where
    several audited actions are themselves Sub Admin actions — here there is
    no Sub Admin action at all.
  * `commissions_insert` / `commissions_update` — full Admin only. An agent's
    own-row branch above is SELECT-only (FOR SELECT, not FOR ALL), so an
    agent physically cannot write their own ledger even by accident.

`api_user` gets SELECT, INSERT, UPDATE — never DELETE. Cancellation is a
status flip (`services/commissions.py::cancel_commission`), so a commission
record is never destroyed; there is no DELETE policy and no grant that would
let one succeed even from a bug.

The agent's own-row predicate keys on `agent_auth_user_uuid` (identity)
rather than `agent_profile_uuid`: an agent's JWT carries `app.auth_user_uuid`
and `app.business_line` directly (single-line by definition — AgentProfile
.business_line is NOT NULL), so this is a flat equality predicate with no
join. This is NOT the client_profile_uuid single-claim gap (that gap is about
a JWT carrying only one of several profile ids for a dual-line identity) —
agents are single-line, so there is only ever one line to carry.

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop
indexes + table (CASCADE via drop_table), drop the enum. The shared trigger
FUNCTION (enforce_business_line_immutable) is not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "692dd51658bf"
down_revision: str | Sequence[str] | None = "9af869604ca2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"
_STATUS_VALUES = ("pending", "paid", "cancelled")

# Full Admin bypasses the line filter, same shape as every other admin_all
# branch. The agent's own-row branch requires BOTH identity and line to match
# — an agent reading across a hypothetical second line (they don't have one,
# but the predicate should not silently rely on that) sees nothing.
_SELECT_PREDICATE = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
    OR (
        agent_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
        AND business_line::text = current_setting('app.business_line', true)
    )
"""

_ADMIN_ONLY_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""


def upgrade() -> None:
    bind = op.get_bind()

    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="commission_status")
    status_enum.create(bind)

    op.create_table(
        "commissions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("agent_profile_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("lead_uuid", sa.UUID(), nullable=False),
        sa.Column("loan_application_uuid", sa.UUID(), nullable=True),
        sa.Column("property_deal_uuid", sa.UUID(), nullable=True),
        sa.Column("agreed_amount_paise", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="commission_status", create_type=False),
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
            ["agent_auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_commissions_agent_auth_user_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["agent_profile_uuid"],
            ["agent_profiles.id"],
            name=op.f("fk_commissions_agent_profile_uuid_agent_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["lead_uuid"],
            ["leads.id"],
            name=op.f("fk_commissions_lead_uuid_leads"),
        ),
        sa.ForeignKeyConstraint(
            ["loan_application_uuid"],
            ["loan_applications.id"],
            name=op.f("fk_commissions_loan_application_uuid_loan_applications"),
        ),
        sa.ForeignKeyConstraint(
            ["property_deal_uuid"],
            ["property_deals.id"],
            name=op.f("fk_commissions_property_deal_uuid_property_deals"),
        ),
        sa.ForeignKeyConstraint(
            ["payout_uuid"],
            ["payouts.id"],
            name=op.f("fk_commissions_payout_uuid_payouts"),
        ),
        sa.ForeignKeyConstraint(
            ["payout_txn_uuid"],
            ["transactions.id"],
            name=op.f("fk_commissions_payout_txn_uuid_transactions"),
        ),
        sa.ForeignKeyConstraint(
            ["entered_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_commissions_entered_by_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_commissions")),
        sa.CheckConstraint(
            "(loan_application_uuid IS NOT NULL) <> (property_deal_uuid IS NOT NULL)",
            name=op.f("ck_commissions_exactly_one_deal_ref"),
        ),
        # Mirrors the schema-layer Field(gt=0, le=10_000_000_000) on
        # CommissionCreate (security review, 2026-07-29): the only writer
        # today goes through that schema, but a DB-level bound means a future
        # direct-SQL path (backfill, console query) can't insert a zero,
        # negative, or absurd amount with nothing to stop it.
        sa.CheckConstraint(
            "agreed_amount_paise > 0 AND agreed_amount_paise <= 10000000000",
            name=op.f("ck_commissions_amount_range"),
        ),
    )

    op.create_index("ix_commissions_agent_auth_user_uuid", "commissions", ["agent_auth_user_uuid"])
    op.create_index("ix_commissions_status", "commissions", ["status"])
    # Double-entry guard: one live (non-cancelled) commission per deal, ever.
    op.create_index(
        "uq_commissions_active_loan_application",
        "commissions",
        ["loan_application_uuid"],
        unique=True,
        postgresql_where=sa.text("status <> 'cancelled' AND loan_application_uuid IS NOT NULL"),
    )
    op.create_index(
        "uq_commissions_active_property_deal",
        "commissions",
        ["property_deal_uuid"],
        unique=True,
        postgresql_where=sa.text("status <> 'cancelled' AND property_deal_uuid IS NOT NULL"),
    )

    op.execute(
        f"CREATE TRIGGER trg_commissions_business_line_immutable "
        f"BEFORE UPDATE ON commissions "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE ON commissions TO api_user")
    op.execute("ALTER TABLE commissions ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY commissions_select ON commissions
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY commissions_insert ON commissions
        FOR INSERT
        WITH CHECK ({_ADMIN_ONLY_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY commissions_update ON commissions
        FOR UPDATE
        USING ({_ADMIN_ONLY_PREDICATE})
        WITH CHECK ({_ADMIN_ONLY_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS commissions_update ON commissions")
    op.execute("DROP POLICY IF EXISTS commissions_insert ON commissions")
    op.execute("DROP POLICY IF EXISTS commissions_select ON commissions")
    op.execute("ALTER TABLE commissions DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON commissions FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_commissions_business_line_immutable ON commissions")
    op.drop_index("uq_commissions_active_property_deal", table_name="commissions")
    op.drop_index("uq_commissions_active_loan_application", table_name="commissions")
    op.drop_index("ix_commissions_status", table_name="commissions")
    op.drop_index("ix_commissions_agent_auth_user_uuid", table_name="commissions")
    op.drop_table("commissions")
    postgresql.ENUM(name="commission_status").drop(op.get_bind())
