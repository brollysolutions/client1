"""de-link transactions/payouts for account deletion

Revision ID: 0ca365644939
Revises: 8a7b6c5d4e3f
Create Date: 2026-07-27 15:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (ALTER
CONSTRAINT via drop+recreate needs a direct connection — ADR-0004).

Account deletion (SRS 5.1) erases the deleted identity's PII but retains
financial records for 7 years, "de-linked from the deleted identity (kept
against an internal reference ID only, not the user's personal data)". This
migration is expand-only groundwork for that: it loosens the owning FK on
`transactions`/`payouts` so the deletion flow can set it NULL instead of
leaving it pointing at a row whose PII has just been scrubbed, and adds the
`retained_ref`/`delinked_at` columns the deletion flow populates at de-link
time. `delinked_at` (not `created_at`) is the anchor for the future 7-year
purge job (SRS 5.1) — the retention clock starts when a record is de-linked,
not when it was created.

Both tables ship EMPTY in production (no producer wired for transactions;
payouts only ever written by the real maker-checker flow, which hasn't gone
live yet per feature-status.md), so this is a pure schema change: no backfill,
no data loss, no existing row can violate the loosened constraint.

No RLS policy change needed: transactions_rls/payouts_rls compare the FK
column against app.auth_user_uuid; a legitimately-NULL de-linked row simply
satisfies neither the owner branch nor becomes visible to the now-anonymous
ex-owner, which is the correct behavior post-deletion.

Rollback: drops the two indexes and four new columns, restores NOT NULL and
the plain FK. UNSAFE once any row has actually been de-linked (a real NULL
would violate the restored NOT NULL) — this downgrade is provided for a
pre-use rollback only, not a fix-forward path after the feature has shipped.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0ca365644939"
down_revision: str | Sequence[str] | None = "8a7b6c5d4e3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- transactions ---
    op.drop_constraint(
        op.f("fk_transactions_user_uuid_auth_users"), "transactions", type_="foreignkey"
    )
    op.alter_column("transactions", "user_uuid", existing_type=sa.UUID(), nullable=True)
    op.create_foreign_key(
        op.f("fk_transactions_user_uuid_auth_users"),
        "transactions",
        "auth_users",
        ["user_uuid"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("transactions", sa.Column("retained_ref", sa.String(length=64), nullable=True))
    op.add_column(
        "transactions", sa.Column("delinked_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        op.f("ix_transactions_delinked_at"),
        "transactions",
        ["delinked_at"],
        postgresql_where=sa.text("delinked_at IS NOT NULL"),
    )

    # --- payouts ---
    op.drop_constraint(
        op.f("fk_payouts_recipient_user_uuid_auth_users"), "payouts", type_="foreignkey"
    )
    op.alter_column("payouts", "recipient_user_uuid", existing_type=sa.UUID(), nullable=True)
    op.create_foreign_key(
        op.f("fk_payouts_recipient_user_uuid_auth_users"),
        "payouts",
        "auth_users",
        ["recipient_user_uuid"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("payouts", sa.Column("retained_ref", sa.String(length=64), nullable=True))
    op.add_column("payouts", sa.Column("delinked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        op.f("ix_payouts_delinked_at"),
        "payouts",
        ["delinked_at"],
        postgresql_where=sa.text("delinked_at IS NOT NULL"),
    )


def downgrade() -> None:
    # UNSAFE post-use — see module docstring. Provided for a pre-use rollback only.
    op.drop_index(op.f("ix_payouts_delinked_at"), table_name="payouts")
    op.drop_column("payouts", "delinked_at")
    op.drop_column("payouts", "retained_ref")
    op.drop_constraint(
        op.f("fk_payouts_recipient_user_uuid_auth_users"), "payouts", type_="foreignkey"
    )
    op.alter_column("payouts", "recipient_user_uuid", existing_type=sa.UUID(), nullable=False)
    op.create_foreign_key(
        op.f("fk_payouts_recipient_user_uuid_auth_users"),
        "payouts",
        "auth_users",
        ["recipient_user_uuid"],
        ["id"],
    )

    op.drop_index(op.f("ix_transactions_delinked_at"), table_name="transactions")
    op.drop_column("transactions", "delinked_at")
    op.drop_column("transactions", "retained_ref")
    op.drop_constraint(
        op.f("fk_transactions_user_uuid_auth_users"), "transactions", type_="foreignkey"
    )
    op.alter_column("transactions", "user_uuid", existing_type=sa.UUID(), nullable=False)
    op.create_foreign_key(
        op.f("fk_transactions_user_uuid_auth_users"),
        "transactions",
        "auth_users",
        ["user_uuid"],
        ["id"],
    )
