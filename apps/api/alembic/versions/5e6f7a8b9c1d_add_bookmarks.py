"""add bookmarks table + RLS

Revision ID: 5e6f7a8b9c1d
Revises: 4d5e6f7a8b9c
Create Date: 2026-07-21 01:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

bookmarks is a REAL-ESTATE-line client's saved-listing list. Identity-level
owner FK (user_uuid -> auth_users.id, keyed on app.auth_user_uuid), same key
as site_visits/enquiries so a "both"-line client's saved listing never
vanishes behind the JWT's loans-first client_profile_uuid claim. UNLIKE
site_visits/enquiries, this table has NO staff/agent read branch — a saved
list is private and no staff workflow consumes it, so the RLS predicate is
the support_tickets shape (owner + platform_scope only), not the hybrid
site_visits shape. business_line is still stamped ("real_estate") and kept
immutable via the shared trigger for invariant/analytics consistency, even
though no RLS branch reads it.

Grants SELECT, INSERT, DELETE (no UPDATE — a bookmark is toggled on/off, never
edited in place). WITH CHECK is identical to USING from day one (leads "D1"
lesson, d4a1b2c3e5f6). UNIQUE(user_uuid, property_ref) is both the natural
"already bookmarked" guard and the ON CONFLICT DO NOTHING idempotency anchor
the create endpoint relies on.

Rollback: drop policy, disable RLS, revoke grants, drop table (drops indexes
and the unique constraint). The business_line-immutability trigger function
itself is NOT touched here — it lives on the shared
enforce_business_line_immutable() function created in e5f6a7b8c9d0; this
migration only attaches/detaches the trigger on bookmarks.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "5e6f7a8b9c1d"
down_revision: str | Sequence[str] | None = "4d5e6f7a8b9c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Identity-level owner predicate only (support_tickets shape): own bookmarks,
# or platform Admin/Sub Admin. Deliberately NO business_line/staff branch.
_RLS_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
"""

_FN = "enforce_business_line_immutable"


def upgrade() -> None:
    op.create_table(
        "bookmarks",
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
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("locality", sa.String(length=120), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_bookmarks_user_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bookmarks")),
    )
    op.create_index(
        op.f("ix_bookmarks_user_uuid"),
        "bookmarks",
        ["user_uuid"],
    )
    op.create_unique_constraint(
        op.f("uq_bookmarks_user_uuid_property_ref"),
        "bookmarks",
        ["user_uuid", "property_ref"],
    )

    op.execute(
        f"CREATE TRIGGER trg_bookmarks_business_line_immutable "
        f"BEFORE UPDATE ON bookmarks "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT, DELETE ON bookmarks TO api_user")
    op.execute("ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY bookmarks_rls ON bookmarks
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS bookmarks_rls ON bookmarks")
    op.execute("ALTER TABLE bookmarks DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, DELETE ON bookmarks FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_bookmarks_business_line_immutable ON bookmarks")
    op.drop_table("bookmarks")
