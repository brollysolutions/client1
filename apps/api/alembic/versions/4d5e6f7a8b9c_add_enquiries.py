"""add enquiries table + enum + RLS

Revision ID: 4d5e6f7a8b9c
Revises: 9c1d2e3f4a5b
Create Date: 2026-07-21 00:30:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

enquiries is a REAL-ESTATE-line client request for staff follow-up on a
listing (the "Enquire" action). It replaces the dashboard's previous
submitLead(...) -> /leads call for this action: an enquiry is its own RLS-
scoped, staff-visible row, not a lead. Same hybrid shape as site_visits
(9c1d2e3f4a5b): identity-level owner FK (user_uuid -> auth_users.id, keyed on
app.auth_user_uuid, the same GUC set from the JWT `sub` claim regardless of
which line profile the token happens to carry) PLUS a business_line column
(immutable once set via the enforce_business_line_immutable trigger from
e5f6a7b8c9d0, always "real_estate" for this table) and the line-staff
predicate from loan_applications/site_visits, because real-estate
telecallers, employees, sub_admins, and agents need to see enquiries the way
they see site-visit requests. Do not "fix" this back to a client_profile_uuid
FK; that is the regression this design avoids (see 9c1d2e3f4a5b).

Grants SELECT, INSERT only (no client-facing update/withdraw endpoint ships
in this pass). WITH CHECK is identical to USING from day one (leads "D1"
lesson, d4a1b2c3e5f6).

Rollback: drop policy, disable RLS, revoke grants, drop table (drops
indexes), drop enum. The business_line-immutability trigger function itself
is NOT touched here — it lives on the shared enforce_business_line_immutable()
function created in e5f6a7b8c9d0; this migration only attaches/detaches the
trigger on enquiries.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "4d5e6f7a8b9c"
down_revision: str | Sequence[str] | None = "9c1d2e3f4a5b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_VALUES = ("new", "contacted", "closed")

# Hybrid predicate: identity-level owner (support_tickets shape) OR'd with the
# line-staff/business_line branch (loan_applications/site_visits shape).
# platform_scope (Admin/Sub Admin) bypasses both.
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

    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="enquiry_status")
    status_enum.create(bind)

    op.create_table(
        "enquiries",
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
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="enquiry_status", create_type=False),
            nullable=False,
            server_default="new",
        ),
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
            name=op.f("fk_enquiries_user_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_enquiries")),
    )
    op.create_index(
        op.f("ix_enquiries_user_uuid"),
        "enquiries",
        ["user_uuid"],
    )

    op.execute(
        f"CREATE TRIGGER trg_enquiries_business_line_immutable "
        f"BEFORE UPDATE ON enquiries "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT ON enquiries TO api_user")
    op.execute("ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY enquiries_rls ON enquiries
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS enquiries_rls ON enquiries")
    op.execute("ALTER TABLE enquiries DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON enquiries FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_enquiries_business_line_immutable ON enquiries")
    op.drop_table("enquiries")
    postgresql.ENUM(name="enquiry_status").drop(op.get_bind())
