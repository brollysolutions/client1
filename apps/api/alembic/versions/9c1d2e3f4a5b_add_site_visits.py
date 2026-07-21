"""add site_visits table + enums + RLS

Revision ID: 9c1d2e3f4a5b
Revises: 3c4d5e6f7a8b
Create Date: 2026-07-21 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

site_visits is a REAL-ESTATE-line client request to view a listing in person.
It is business-scoped (per the product's line-segregation invariant) but
deliberately does NOT copy loan_applications' (2b3c4d5e6f7a) client_profile_uuid
FK shape: the JWT only ever carries a SINGLE client_profile_uuid claim, chosen
loans-first by auth_service._build_access_claims (see
test_loans_api.py::test_both_line_client_still_sees_loans_application). A
"both"-line client's real-estate site visit would silently disappear from
their own RLS-scoped view under that shape, because the JWT presented at
request time carries the loans profile, not the real-estate one.

Instead this is a HYBRID: identity-level owner FK like support_tickets
(3c4d5e6f7a8b) — user_uuid -> auth_users.id, keyed on app.auth_user_uuid, the
same GUC set from the JWT `sub` claim regardless of which line profile the
token happens to carry — PLUS a business_line column (immutable once set via
the enforce_business_line_immutable trigger from e5f6a7b8c9d0, always
"real_estate" for this table) and the line-staff predicate from
loan_applications (2b3c4d5e6f7a), because real-estate telecallers, employees,
sub_admins, and agents need to see site-visit requests the way loans staff see
loan_applications — support_tickets' identity-only predicate has no such
branch. Do not "fix" this back to a client_profile_uuid FK; that is the
regression this design avoids.

Grants SELECT, INSERT, UPDATE (UPDATE is new vs. support_tickets' SELECT+INSERT
— needed so the owning client can cancel their own request). WITH CHECK is
identical to USING from day one (leads "D1" lesson, d4a1b2c3e5f6) — a
cancel/update must satisfy the same predicate as the read that found the row.

Rollback: drop policy, disable RLS, revoke grants, drop table (drops indexes),
drop enums. The business_line-immutability trigger itself is NOT touched here
— it lives on the shared enforce_business_line_immutable() function created in
e5f6a7b8c9d0; this migration only attaches/detaches the trigger on
site_visits.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "9c1d2e3f4a5b"
down_revision: str | Sequence[str] | None = "3c4d5e6f7a8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TIME_SLOT_VALUES = ("morning", "afternoon", "evening")
_STATUS_VALUES = ("requested", "confirmed", "done", "cancelled")

# Hybrid predicate: identity-level owner (support_tickets shape) OR'd with the
# line-staff/business_line branch (loan_applications shape). platform_scope
# (Admin/Sub Admin) bypasses both.
_RLS_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin', 'agent')
    )
"""

_FN = "enforce_business_line_immutable"


def upgrade() -> None:
    bind = op.get_bind()

    time_slot = postgresql.ENUM(*_TIME_SLOT_VALUES, name="site_visit_time_slot")
    time_slot.create(bind)
    visit_status = postgresql.ENUM(*_STATUS_VALUES, name="site_visit_status")
    visit_status.create(bind)

    op.create_table(
        "site_visits",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("property_ref", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("locality", sa.String(length=120), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("contact_name", sa.String(length=100), nullable=False),
        sa.Column("contact_mobile", sa.String(length=20), nullable=False),
        sa.Column("preferred_date", sa.Date(), nullable=False),
        sa.Column(
            "preferred_time_slot",
            postgresql.ENUM(*_TIME_SLOT_VALUES, name="site_visit_time_slot", create_type=False),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="site_visit_status", create_type=False),
            nullable=False,
            server_default="requested",
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
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
            name=op.f("fk_site_visits_user_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_site_visits")),
    )
    op.create_index(
        op.f("ix_site_visits_user_uuid"),
        "site_visits",
        ["user_uuid"],
    )

    op.execute(
        f"CREATE TRIGGER trg_site_visits_business_line_immutable "
        f"BEFORE UPDATE ON site_visits "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE ON site_visits TO api_user")
    op.execute("ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY site_visits_rls ON site_visits
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS site_visits_rls ON site_visits")
    op.execute("ALTER TABLE site_visits DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON site_visits FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_site_visits_business_line_immutable ON site_visits")
    op.drop_table("site_visits")
    postgresql.ENUM(name="site_visit_status").drop(op.get_bind())
    postgresql.ENUM(name="site_visit_time_slot").drop(op.get_bind())
