"""admin loan-config CRUD: writable loan_types/banks + bank_loan_type_availability

Revision ID: 678f7a77e812
Revises: 1dd0bc6bed88
Create Date: 2026-07-28 16:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004).

Closes feature-status.md §3 #4 (FR-6.3/FR-6.4): loan_types and banks have been
GET-only reference data since 1a2b3c4d5e6f ("Both ship with no admin CRUD yet").
This migration unblocks `services/loan_config.py` writes on both tables and adds
the per-bank loan-type availability matrix from the ERD
(master_erd.mermaid §LOANS LINE, `bank_loan_type_availability`), which until now
existed only in docs.

No DELETE anywhere, on any of the three tables. loan_applications.loan_type_id is
a NOT NULL RESTRICT FK — a delete only ever succeeds where `active=false` is
already sufficient, so it adds no capability. loan_applications.bank_id is
`ON DELETE SET NULL` — deleting a bank would silently erase which bank funded a
historical disbursed loan, which is destruction of a financial record with no
error and no trace. Enforced the way audit_log/loan_txn_history/offers already do
it: withhold the GRANT, not just the route. There is no FOR DELETE policy on any
of these three tables because there is no DELETE grant for one to gate.

Availability semantics are an EXPLICIT OVERRIDE with a PERMISSIVE DEFAULT: a
missing (bank_id, loan_type_id) row means available, `available=false` is the
only row that ever excludes a bank. The write path (services.loan_config
::set_bank_availability) always upserts the FULL vector for one bank on every
save, so both boolean values are genuinely stored in practice — "always false"
is not a real state to design around. This ships the table EMPTY: day-one
behavior is byte-identical to today (every bank offers every loan type, matching
FR-6.3's "all loan types shall be supported in principle"), and a brand-new bank
or loan type is available everywhere by default rather than invisible until an
admin configures every cell — the opposite (a seeded full matrix with fan-out on
every create) has a silent-total-failure mode if the fan-out is ever missed, an
unfixable create-create race, and would non-deterministically break every
existing test that picks a seeded bank/loan-type via an unordered `LIMIT 1`
(test_loan_progress_api.py::_active_bank_id, test_loans_create_api.py,
test_loans_rls.py, test_loan_applications_partial_unique.py,
test_referral_conversion.py).

bank_loan_type_availability's SELECT policy is deliberately `USING (true)` —
readable by every authenticated role, not just Admin. This is the ONE place in
this migration that inverts the "narrow positive allowlist" pattern the rest of
this file follows, and it is load-bearing: services.loan_applications reads this
table to enforce which bank a Telecaller/Admin may assign to a progressing loan
application (a missing row = available, so RLS-filtering it down to zero rows for
a non-admin session would silently turn that enforcement into a permanent no-op
that every admin-run test would still pass). Writes stay Admin-only.

FKs on bank_loan_type_availability are ON DELETE CASCADE, which looks like it
contradicts the no-destructive-delete stance above but does not: a matrix cell
for a bank or loan type that no longer exists is garbage, not history — and it is
unreachable via the API anyway, since neither parent table has a DELETE grant.

Column-scoped UPDATE grants exclude loan_types.name (the stable slug, and the
UNIQUE anchor the seed relies on) and loan_types.custom_fields (Admin design
§5.2 "Open Item A" — the per-loan-type custom-field builder is explicitly out of
scope, feature-status.md §4). `updated_at` IS included in both column lists:
SQLAlchemy's `onupdate` stamps it on every UPDATE, and omitting it from a
column-scoped grant 500s every write touching that table (the exact bug
retention-purge PR #120 shipped and had to fix for support_tickets).

uq_banks_name_lower is a case-insensitive functional unique index rather than a
plain UNIQUE(name) constraint, which would still admit "HDFC Bank" and
"hdfc bank" as two rows. Safe against current data — only the 10 deterministic
seeds from d5e6f7a8b9c0 exist today and are already pairwise distinct.

Rollback: drop policies, disable RLS, revoke grants (including the column-scoped
ones), drop bank_loan_type_availability (drops its FKs + index), drop the unique
index, drop the two added columns. The pre-existing loan_types_rls/banks_rls
SELECT-only policies from 1a2b3c4d5e6f are untouched by both directions.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "678f7a77e812"
down_revision: str | Sequence[str] | None = "1dd0bc6bed88"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Admin-only write gate, shared across loan_types/banks/availability.
_ADMIN = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""

# See module docstring: deliberately permissive, not Admin-scoped. A row you
# cannot see cannot enforce anything against you.
_AVAILABILITY_SELECT = "true"


def upgrade() -> None:
    op.add_column(
        "loan_types",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.add_column(
        "banks",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.execute("CREATE UNIQUE INDEX uq_banks_name_lower ON banks (lower(name))")

    op.create_table(
        "bank_loan_type_availability",
        sa.Column("bank_id", sa.UUID(), nullable=False),
        sa.Column("loan_type_id", sa.UUID(), nullable=False),
        sa.Column("available", sa.Boolean(), nullable=False),
        sa.Column("updated_by_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["bank_id"],
            ["banks.id"],
            name=op.f("fk_bank_loan_type_availability_bank_id_banks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["loan_type_id"],
            ["loan_types.id"],
            name=op.f("fk_bank_loan_type_availability_loan_type_id_loan_types"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_bank_loan_type_availability_updated_by_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "bank_id", "loan_type_id", name=op.f("pk_bank_loan_type_availability")
        ),
    )
    # The PK covers (bank_id, loan_type_id) so a bank_id-prefixed lookup is
    # already indexed; loan_type_id alone is not. Both the `GET /loans/banks
    # ?loan_type_id=` filter and the enforcement probe in
    # services.loan_applications filter on loan_type_id.
    op.create_index(
        op.f("ix_bank_loan_type_availability_loan_type_id"),
        "bank_loan_type_availability",
        ["loan_type_id"],
    )

    # --- loan_types: writable by Admin only. name/custom_fields stay un-writable. ---
    op.execute("GRANT INSERT ON loan_types TO api_user")
    op.execute("GRANT UPDATE (label, active, updated_at) ON loan_types TO api_user")
    op.execute(
        f"""
        CREATE POLICY loan_types_insert ON loan_types
        FOR INSERT
        WITH CHECK ({_ADMIN});
        """
    )
    op.execute(
        f"""
        CREATE POLICY loan_types_update ON loan_types
        FOR UPDATE
        USING ({_ADMIN})
        WITH CHECK ({_ADMIN});
        """
    )

    # --- banks: writable by Admin only. ---
    op.execute("GRANT INSERT ON banks TO api_user")
    op.execute("GRANT UPDATE (name, logo_key, active, updated_at) ON banks TO api_user")
    op.execute(
        f"""
        CREATE POLICY banks_insert ON banks
        FOR INSERT
        WITH CHECK ({_ADMIN});
        """
    )
    op.execute(
        f"""
        CREATE POLICY banks_update ON banks
        FOR UPDATE
        USING ({_ADMIN})
        WITH CHECK ({_ADMIN});
        """
    )

    # --- bank_loan_type_availability: read by anyone, written by Admin only. ---
    op.execute("GRANT SELECT, INSERT, UPDATE ON bank_loan_type_availability TO api_user")
    op.execute("ALTER TABLE bank_loan_type_availability ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY bank_loan_type_availability_select ON bank_loan_type_availability
        FOR SELECT
        USING ({_AVAILABILITY_SELECT});
        """
    )
    op.execute(
        f"""
        CREATE POLICY bank_loan_type_availability_insert ON bank_loan_type_availability
        FOR INSERT
        WITH CHECK ({_ADMIN});
        """
    )
    op.execute(
        f"""
        CREATE POLICY bank_loan_type_availability_update ON bank_loan_type_availability
        FOR UPDATE
        USING ({_ADMIN})
        WITH CHECK ({_ADMIN});
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS bank_loan_type_availability_update ON bank_loan_type_availability"
    )
    op.execute(
        "DROP POLICY IF EXISTS bank_loan_type_availability_insert ON bank_loan_type_availability"
    )
    op.execute(
        "DROP POLICY IF EXISTS bank_loan_type_availability_select ON bank_loan_type_availability"
    )
    op.execute("ALTER TABLE bank_loan_type_availability DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON bank_loan_type_availability FROM api_user")

    op.execute("DROP POLICY IF EXISTS banks_update ON banks")
    op.execute("DROP POLICY IF EXISTS banks_insert ON banks")
    op.execute("REVOKE UPDATE (name, logo_key, active, updated_at) ON banks FROM api_user")
    op.execute("REVOKE INSERT ON banks FROM api_user")

    op.execute("DROP POLICY IF EXISTS loan_types_update ON loan_types")
    op.execute("DROP POLICY IF EXISTS loan_types_insert ON loan_types")
    op.execute("REVOKE UPDATE (label, active, updated_at) ON loan_types FROM api_user")
    op.execute("REVOKE INSERT ON loan_types FROM api_user")

    op.drop_index(
        op.f("ix_bank_loan_type_availability_loan_type_id"),
        table_name="bank_loan_type_availability",
    )
    op.drop_table("bank_loan_type_availability")

    op.execute("DROP INDEX IF EXISTS uq_banks_name_lower")

    op.drop_column("banks", "updated_at")
    op.drop_column("loan_types", "updated_at")
