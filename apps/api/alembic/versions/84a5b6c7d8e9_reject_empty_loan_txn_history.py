"""reject empty loan transaction-history rows

Revision ID: 84a5b6c7d8e9
Revises: 73f4c2a91d6e
Create Date: 2026-08-27

The Telecaller API now requires a complete FR-6.5 transaction snapshot.  The
database constraint is deliberately the narrower compatibility backstop: it
rejects only rows with no meaningful business value, while preserving any
legacy partial history that may have been recorded before the API contract was
tightened.  Fully blank rows carry no financial fact and are removed before
the check is installed.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "84a5b6c7d8e9"
down_revision: str | Sequence[str] | None = "73f4c2a91d6e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NOT_EMPTY = """
    NULLIF(BTRIM(bank_name), '') IS NOT NULL
    OR amount IS NOT NULL
    OR interest_rate IS NOT NULL
    OR txn_date IS NOT NULL
"""


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM loan_txn_history
        WHERE NULLIF(BTRIM(bank_name), '') IS NULL
          AND amount IS NULL
          AND interest_rate IS NULL
          AND txn_date IS NULL
        """
    )
    op.create_check_constraint(
        "ck_loan_txn_history_not_empty",
        "loan_txn_history",
        _NOT_EMPTY,
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_loan_txn_history_not_empty",
        "loan_txn_history",
        type_="check",
    )
