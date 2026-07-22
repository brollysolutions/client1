"""add property_submissions table + enum + RLS

Revision ID: c3d4e5f6a7b8
Revises: bf2c3d4e5a6b
Create Date: 2026-07-22 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL + GRANT
+ RLS policy require a direct connection — ADR-0004).

property_submissions is the WRITE path for the properties catalog: an agent-owned
listing draft awaiting Admin/Sub Admin review. RLS is hybrid — owner (the submitting
agent, submitter_uuid keyed on app.auth_user_uuid) can SELECT/INSERT own rows;
platform reviewers (Admin + Sub Admin via platform_scope='true', plus a real-estate
Sub Admin via the role+line branch) can SELECT the whole queue. UPDATE is NOT granted
to api_user: approval/rejection run in a bypass superuser session
(services.property_submissions), so the status flip never rides a reviewer request txn
and the catalog keeps its SELECT-only grant. business_line is immutable via the shared
enforce_business_line_immutable() trigger (e5f6a7b8c9d0).

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop table (drops
index + FK), drop enum. The shared trigger FUNCTION is not touched (only the trigger).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "bf2c3d4e5a6b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_VALUES = ("pending", "approved", "rejected")
_FN = "enforce_business_line_immutable"

# SELECT: platform reviewer (Admin+Sub Admin) OR the owning agent OR a real-estate
# Sub Admin. Deliberately NOT the enquiries "all RE staff" shape — review is
# platform-only, so telecaller/employee/non-owner agents see nothing.
_SELECT_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR submitter_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        current_setting('app.role', true) = 'sub_admin'
        AND business_line::text = current_setting('app.business_line', true)
    )
"""

# INSERT: an agent may only create a row it owns, on the real-estate line.
_INSERT_CHECK = """
    submitter_uuid::text = current_setting('app.auth_user_uuid', true)
    AND business_line::text = 'real_estate'
"""


def upgrade() -> None:
    bind = op.get_bind()

    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="re_submission_status")
    status_enum.create(bind)

    op.create_table(
        "property_submissions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("submitter_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="re_submission_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by_uuid", sa.UUID(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_property_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("location", sa.String(length=160), nullable=False),
        sa.Column("meta", sa.String(length=120), nullable=True),
        sa.Column("image", sa.String(length=200), nullable=True),
        sa.Column(
            "category",
            postgresql.ENUM(
                "houses",
                "apartments",
                "villas",
                "plots",
                "commercial",
                name="re_property_category",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("locality", sa.String(length=120), nullable=False),
        sa.Column("pincode", sa.String(length=6), nullable=False),
        sa.Column("price_paise", sa.BigInteger(), nullable=False),
        sa.Column("bhk", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("area_sqft", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "furnishing",
            postgresql.ENUM(
                "unfurnished", "semi", "furnished", name="re_furnishing", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "construction_status",
            postgresql.ENUM(
                "ready", "under_construction", name="re_construction_status", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("amenities", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("age_years", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("rera_number", sa.String(length=40), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default="{}"),
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
            ["submitter_uuid"],
            ["auth_users.id"],
            name=op.f("fk_property_submissions_submitter_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_property_submissions")),
    )
    op.create_index(
        op.f("ix_property_submissions_submitter_uuid"),
        "property_submissions",
        ["submitter_uuid"],
    )

    op.execute(
        f"CREATE TRIGGER trg_property_submissions_business_line_immutable "
        f"BEFORE UPDATE ON property_submissions "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    # No UPDATE/DELETE grant: approval/rejection mutate via the bypass superuser
    # session; api_user only reads the queue and inserts new drafts.
    op.execute("GRANT SELECT, INSERT ON property_submissions TO api_user")
    op.execute("ALTER TABLE property_submissions ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY property_submissions_select ON property_submissions
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY property_submissions_insert ON property_submissions
        FOR INSERT
        WITH CHECK ({_INSERT_CHECK});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS property_submissions_insert ON property_submissions")
    op.execute("DROP POLICY IF EXISTS property_submissions_select ON property_submissions")
    op.execute("ALTER TABLE property_submissions DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON property_submissions FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_property_submissions_business_line_immutable "
        "ON property_submissions"
    )
    op.drop_index(op.f("ix_property_submissions_submitter_uuid"), table_name="property_submissions")
    op.drop_table("property_submissions")
    postgresql.ENUM(name="re_submission_status").drop(op.get_bind())
