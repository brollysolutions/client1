"""add banners table + enums + RLS (Sub Admin content, slice 1)

Revision ID: a4b5c6d7e8f9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-24 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL + GRANT
+ RLS policy require a direct connection — ADR-0004).

banners is the first of four Sub Admin content tables (SubAdmin_Dashboard_System_
Design.md §5) and establishes the pattern the other three (offers, content_blocks,
referral_bonus_config) will repeat: a NARROW POSITIVE RLS ALLOWLIST
(`current_setting('app.role') = 'sub_admin'`), the OPPOSITE of the
`platform_scope='true'` bypass used almost everywhere else in this schema. Every
other role — including Admin's usual platform bypass — gets NO grant at all here;
"cannot view full lead details" (FR-2.3)'s sibling guarantee for this table is
"denial by absence, not a filter" (spec §7). Admin still needs to read the queue
to approve/reject, so Admin is added to the SELECT policy explicitly (not via
platform_scope) and the approve/reject mutation itself runs on a bypass superuser
session (services.banners), mirroring services.property_submissions — the status
flip never rides the reviewer's request transaction, and api_user keeps only
SELECT/INSERT/UPDATE-while-draft (no UPDATE grant for the approval transition).

business_line is NOT NULL here even though the Sub Admin role itself is platform-
scoped/cross-line: individual banners are line-tagged for customer-facing
filtering (spec §2, "every artifact is line-tagged"). Immutable via the shared
enforce_business_line_immutable() trigger (e5f6a7b8c9d0), same as every other
business-scoped table.

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop table
(drops index + FK), drop enums. The shared trigger FUNCTION is not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: str | Sequence[str] | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BANNER_TYPE_VALUES = ("default", "personalized", "action")
_BANNER_STATUS_VALUES = ("draft", "pending_approval", "approved", "live", "rejected", "archived")
_FN = "enforce_business_line_immutable"

# SELECT: the content team (sub_admin, sees all rows — shared surface, not owner-
# scoped) plus Admin (needs the queue to approve/reject). Deliberately NOT
# platform_scope='true' — that would also grant Telecaller/Employee/Agent nothing
# here since they're not platform-scoped, but it WOULD grant a platform Client if
# one ever existed, which is not this product's model; an explicit role check is
# the correct narrow grant regardless.
_SELECT_PREDICATE = """
    current_setting('app.role', true) = 'sub_admin'
    OR current_setting('app.role', true) = 'admin'
"""

# INSERT: only sub_admin, and only ever as a fresh draft — the raw INSERT grant
# must not be usable to plant an already-live/approved row.
_INSERT_CHECK = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
    AND status::text = 'draft'
"""

# UPDATE: sub_admin may edit their own banner only while it's still editable
# (draft, or rejected — resubmitting after feedback). The pending_approval ->
# approved/live and -> rejected transitions are NOT reachable through this
# policy; they run via the bypass service (services.banners), same as
# property_submissions' approve/reject.
_UPDATE_USING = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
    AND status::text IN ('draft', 'rejected')
"""
_UPDATE_CHECK = """
    created_by_uuid::text = current_setting('app.auth_user_uuid', true)
    AND status::text IN ('draft', 'pending_approval', 'rejected')
"""
# WITH CHECK's status set looks wider than the two things the app actually
# does through this policy (plain field edits that leave status untouched,
# and submit_banner's draft/rejected -> pending_approval flip) because
# Postgres RLS's WITH CHECK only sees the post-update row, not the pre-update
# one — a same-value carry-through (e.g. editing title while status stays
# 'rejected', to save without resubmitting yet) and an actual transition both
# produce the same new-row shape the policy has to accept. 'rejected' is only
# ever a same-value carry here: the app never writes status='rejected' via
# api_user (only the bypass reject_banner in services/banners.py does, on a
# superuser session this policy doesn't gate). schemas/banners.py's
# BannerUpdate never exposes `status`, so this width isn't reachable as an
# actual bypass today, but if a future endpoint were to accept a
# client-supplied status this policy would need a real transition guard
# (trigger or narrower per-request check), not just this set.


def upgrade() -> None:
    bind = op.get_bind()

    banner_type_enum = postgresql.ENUM(*_BANNER_TYPE_VALUES, name="banner_type")
    banner_type_enum.create(bind)
    banner_status_enum = postgresql.ENUM(*_BANNER_STATUS_VALUES, name="banner_status")
    banner_status_enum.create(bind)

    op.create_table(
        "banners",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "banner_type",
            postgresql.ENUM(*_BANNER_TYPE_VALUES, name="banner_type", create_type=False),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("image_key", sa.Text(), nullable=True),
        sa.Column("deep_link", sa.Text(), nullable=True),
        sa.Column(
            "audience_rules",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            postgresql.ENUM(*_BANNER_STATUS_VALUES, name="banner_status", create_type=False),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("created_by_uuid", sa.UUID(), nullable=False),
        sa.Column("approved_by_uuid", sa.UUID(), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
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
            ["created_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_banners_created_by_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["approved_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_banners_approved_by_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_banners")),
    )
    op.create_index(op.f("ix_banners_created_by_uuid"), "banners", ["created_by_uuid"])
    op.create_index(op.f("ix_banners_status"), "banners", ["status"])

    op.execute(
        f"CREATE TRIGGER trg_banners_business_line_immutable "
        f"BEFORE UPDATE ON banners "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    # No DELETE grant. UPDATE is granted (unlike property_submissions) because
    # sub_admin's own draft/rejected-editing path is a real RLS-covered UPDATE,
    # not just the approval transition — which stays bypass-only regardless.
    op.execute("GRANT SELECT, INSERT, UPDATE ON banners TO api_user")
    op.execute("ALTER TABLE banners ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY banners_select ON banners
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY banners_insert ON banners
        FOR INSERT
        WITH CHECK ({_INSERT_CHECK});
        """
    )
    op.execute(
        f"""
        CREATE POLICY banners_update ON banners
        FOR UPDATE
        USING ({_UPDATE_USING})
        WITH CHECK ({_UPDATE_CHECK});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS banners_update ON banners")
    op.execute("DROP POLICY IF EXISTS banners_insert ON banners")
    op.execute("DROP POLICY IF EXISTS banners_select ON banners")
    op.execute("ALTER TABLE banners DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON banners FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_banners_business_line_immutable ON banners")
    op.drop_index(op.f("ix_banners_status"), table_name="banners")
    op.drop_index(op.f("ix_banners_created_by_uuid"), table_name="banners")
    op.drop_table("banners")
    postgresql.ENUM(name="banner_status").drop(op.get_bind())
    postgresql.ENUM(name="banner_type").drop(op.get_bind())
