"""allow Telecaller and Employee staff profiles to serve both lines

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-08-10 00:00:00.000000

Operational rows remain loans/real_estate only. A dual-line staff profile is
resolved to one concrete request line before PostgreSQL RLS context is set.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: str | Sequence[str] | None = "b4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _replace_function(function: str, replacements: tuple[tuple[str, str, int], ...]) -> None:
    bind = op.get_bind()
    definition = bind.execute(
        sa.text("SELECT pg_get_functiondef(CAST(:function AS regprocedure))"),
        {"function": function},
    ).scalar_one()
    for old, new, expected_count in replacements:
        actual_count = definition.count(old)
        if actual_count != expected_count:
            raise RuntimeError(
                f"unexpected {function} definition: expected {expected_count} occurrences "
                f"of {old!r}, found {actual_count}"
            )
        definition = definition.replace(old, new)
    op.execute(definition)


_PARENT_UP = (
    (
        "staff.business_line = NEW.business_line",
        "staff.business_line IN (NEW.business_line, 'both')",
        2,
    ),
    (
        "raiser.business_line IS NULL OR raiser.business_line = NEW.business_line",
        "raiser.business_line IS NULL OR raiser.business_line IN (NEW.business_line, 'both')",
        1,
    ),
    (
        "assignee.business_line = NEW.business_line",
        "assignee.business_line IN (NEW.business_line, 'both')",
        2,
    ),
    (
        "arranger.business_line = NEW.business_line",
        "arranger.business_line IN (NEW.business_line, 'both')",
        1,
    ),
)
_PARENT_DOWN = tuple((new, old, count) for old, new, count in _PARENT_UP)
_LEAD_UP = (
    (
        "staff.business_line = NEW.business_line",
        "staff.business_line IN (NEW.business_line, 'both')",
        1,
    ),
)
_LEAD_DOWN = tuple((new, old, count) for old, new, count in _LEAD_UP)
_CURSOR_UP = (
    (
        "staff.business_line = NEW.business_line",
        "staff.business_line IN (NEW.business_line, 'both')",
        1,
    ),
)
_CURSOR_DOWN = tuple((new, old, count) for old, new, count in _CURSOR_UP)


def upgrade() -> None:
    op.execute(
        "ALTER TABLE staff_profiles DROP CONSTRAINT ck_staff_profiles_scope_matches_business_line"
    )
    op.execute(
        "ALTER TABLE staff_profiles ADD CONSTRAINT "
        "ck_staff_profiles_scope_matches_business_line CHECK ("
        "(scope::text = 'platform' AND business_line IS NULL) OR "
        "(scope::text = 'line' AND (business_line::text IN ('loans', 'real_estate') OR "
        "(business_line::text = 'both' AND role::text IN ('telecaller', 'employee')))))"
    )
    _replace_function("public.validate_business_line_parent()", _PARENT_UP)
    _replace_function("public.validate_lead_assignment_scope()", _LEAD_UP)
    _replace_function("public.validate_lead_assignment_cursor()", _CURSOR_UP)


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM public.staff_profiles
                WHERE business_line::text = 'both'
            ) THEN
                RAISE EXCEPTION 'cannot downgrade while dual-line staff profiles exist';
            END IF;
        END
        $$
        """
    )
    _replace_function("public.validate_lead_assignment_cursor()", _CURSOR_DOWN)
    _replace_function("public.validate_lead_assignment_scope()", _LEAD_DOWN)
    _replace_function("public.validate_business_line_parent()", _PARENT_DOWN)
    op.execute(
        "ALTER TABLE staff_profiles DROP CONSTRAINT ck_staff_profiles_scope_matches_business_line"
    )
    op.execute(
        "ALTER TABLE staff_profiles ADD CONSTRAINT "
        "ck_staff_profiles_scope_matches_business_line CHECK ("
        "(scope::text = 'platform' AND business_line IS NULL) OR "
        "(scope::text = 'line' AND business_line::text IN ('loans', 'real_estate')))"
    )
