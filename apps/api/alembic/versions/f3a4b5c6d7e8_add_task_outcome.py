"""add tasks.outcome + bg_check_outcome enum

Revision ID: f3a4b5c6d7e8
Revises: d4e5f6a7b8c9
Create Date: 2026-07-23 10:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL
requires a direct connection — ADR-0004).

Employee_Dashboard_System_Design.md §4.2/§5.1: a background_check task records
its result as an outcome verdict. Additive only — nullable column, new enum,
no RLS/grant/trigger change (tasks_rls filters rows, not columns; the existing
table-level GRANT already covers new columns; the business_line-immutability
trigger only guards that one column).

Validity (background_check-only, completed-only) is enforced in
services/employee.py, not a DB CHECK constraint — matches this repo's existing
idiom of service-layer transition/field validation over DB constraints.

Rollback: drop column, drop enum. No data-affecting backfill.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OUTCOME_VALUES = ("clear", "flagged", "inconclusive")


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM(*_OUTCOME_VALUES, name="bg_check_outcome").create(bind)
    op.add_column(
        "tasks",
        sa.Column(
            "outcome",
            postgresql.ENUM(*_OUTCOME_VALUES, name="bg_check_outcome", create_type=False),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("tasks", "outcome")
    postgresql.ENUM(name="bg_check_outcome").drop(op.get_bind())
