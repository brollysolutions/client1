"""loan_applications: column-scoped UPDATE grant + telecaller assigned-lead scope + seed banks

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-23 12:05:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004).

Unblocks loan-application lifecycle progression (Telecaller + Admin write the
status/deal-terms axis introduced in this slice; see services/loan_applications.py).
Three independent changes:

1. Column-scoped UPDATE grant (least privilege) — identity columns
   (lead_uuid, client_profile_uuid, business_line, amount_requested, opened_at)
   stay un-writable at the DB level; only the progression fields are grantable.

2. loan_applications_rls (2b3c4d5e6f7a) currently gives ANY same-line
   telecaller/employee/sub_admin whole-line access (its combined branch).
   This splits that branch exactly as leads_rls was split in e6c7b8f9a0d1:
   employee/sub_admin keep whole-line access (unchanged), telecaller is
   narrowed to applications whose lead is assigned to them specifically. This
   IS the narrowing loan_txn_history_rls's docstring (a1b2c3d4e5f6) warned
   about — verified compatible: that policy's telecaller EXISTS branch
   already carries its own identical assigned-lead predicate independent of
   this table's SELECT visibility, so narrowing here doesn't change what it
   exposes. USING = WITH CHECK on every branch (the leads "D1" lesson from
   d4a1b2c3e5f6 — an asymmetric WITH CHECK silently blocks legitimate writes).

   Accepted trade-off (same posture as leads_rls): this is a single FOR ALL
   policy, so the client-own and employee/sub_admin branches technically
   pass UPDATE RLS too, not just SELECT. The column-scoped grant above plus
   "no client/employee update endpoint exists" are the actual mitigation —
   flagged for review, not fixed here (per-command split policies are the
   stricter alternative).

3. Seed 10 major Indian banks (idempotent — matches the loan_types seed
   posture from 1a2b3c4d5e6f: deterministic uuid5 ids, no admin CRUD exists
   yet so this is the only writer). Unblocks the bank picker in both new
   staff UIs from day one instead of shipping with an empty reference table.

Rollback: revoke the column UPDATE grant, restore the pre-existing broad
predicate (2b3c4d5e6f7a's combined telecaller/employee/sub_admin branch),
delete the seeded banks by their deterministic ids.
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UPDATE_COLUMNS = (
    "status",
    "status_reason",
    "closed_at",
    "bank_id",
    "amount_sanctioned",
    "interest_rate",
    "processing_fee",
    "fee_outcome",
)

_PREDICATE_NEW = """
    current_setting('app.platform_scope', true) = 'true'
    OR client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND EXISTS (
            SELECT 1 FROM leads l
            WHERE l.id = loan_applications.lead_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
"""

# Pre-existing broad predicate (2b3c4d5e6f7a) — restored on downgrade.
_PREDICATE_OLD = """
    current_setting('app.platform_scope', true) = 'true'
    OR client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
    )
"""

_BANK_NAMESPACE = uuid.UUID("8f3d2c1b-4a5e-4f6d-9b8c-7a6e5d4c3b2a")

_BANK_SEED = (
    "HDFC Bank",
    "State Bank of India",
    "ICICI Bank",
    "Axis Bank",
    "Kotak Mahindra Bank",
    "Punjab National Bank",
    "Bank of Baroda",
    "Canara Bank",
    "IDFC First Bank",
    "Yes Bank",
)


def _bank_id(name: str) -> uuid.UUID:
    return uuid.uuid5(_BANK_NAMESPACE, name)


def _recreate_policy(predicate: str) -> None:
    op.execute("DROP POLICY IF EXISTS loan_applications_rls ON loan_applications")
    op.execute(
        f"""
        CREATE POLICY loan_applications_rls ON loan_applications
        FOR ALL
        USING ({predicate})
        WITH CHECK ({predicate});
        """
    )


def upgrade() -> None:
    columns = ", ".join(_UPDATE_COLUMNS)
    op.execute(f"GRANT UPDATE ({columns}) ON loan_applications TO api_user")
    _recreate_policy(_PREDICATE_NEW)

    banks_table = sa.table(
        "banks",
        sa.column("id", sa.UUID()),
        sa.column("name", sa.String()),
    )
    op.bulk_insert(
        banks_table,
        [{"id": _bank_id(name), "name": name} for name in _BANK_SEED],
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM banks WHERE id = ANY(:ids)"),
        {"ids": [_bank_id(name) for name in _BANK_SEED]},
    )
    _recreate_policy(_PREDICATE_OLD)
    columns = ", ".join(_UPDATE_COLUMNS)
    op.execute(f"REVOKE UPDATE ({columns}) ON loan_applications FROM api_user")
