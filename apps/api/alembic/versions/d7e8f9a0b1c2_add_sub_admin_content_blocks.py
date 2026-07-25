"""add content_blocks table + enum + RLS (Sub Admin content, slice 3)

Revision ID: d7e8f9a0b1c2
Revises: 362b7d859686
Create Date: 2026-07-25 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL + GRANT
+ RLS policy require a direct connection — ADR-0004).

content_blocks is the third of four Sub Admin content tables (SubAdmin_Dashboard_
System_Design.md §5.3) and repeats the narrow positive RLS allowlist proven by
banners (a4b5c6d7e8f9) and offers (b5c6d7e8f9a0). Like offers there is NO Admin-
approval gate — spec Open Item A is resolved per the spec's own default: website
content publishes directly, sub_admin owns the whole lifecycle
(draft -> published -> archived, forward-only, app-layer guarded in
services/content.py). Admin keeps SELECT-only oversight. No bypass session exists
for this table at all.

business_line is NULLABLE here — the ONE Sub Admin content table where the line
tag is optional (spec §5.3: "NULL = cross-line/global content"), unlike
banners/offers which are NOT NULL. The shared enforce_business_line_immutable()
trigger (e5f6a7b8c9d0) is still attached: it permits the first NULL -> value
assignment and rejects every later change including value -> NULL, so a global
block can in principle be line-tagged once. The app layer never does this —
business_line is create-only, absent from ContentBlockUpdate — so the trigger is
belt-and-braces against a direct write.

slug is UNIQUE (page/section key, the lookup handle a future public renderer will
use). Uniqueness is enforced by the DB constraint, surfaced as a 409 by the
router; there is no per-line namespacing (a slug is globally unique across both
lines, matching the spec's plain `TEXT UNIQUE`).

body is nullable so a block can be drafted before its copy is written; publishing
requires non-empty body, enforced in services/content.py (an app-layer content
rule, not a DB constraint — an archived block whose body is later blanked must
not become un-archivable).

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop table
(drops indexes + unique constraint + FK), drop enum. The shared trigger FUNCTION
is not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | Sequence[str] | None = "362b7d859686"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CONTENT_STATUS_VALUES = ("draft", "published", "archived")
_FN = "enforce_business_line_immutable"

# SELECT: sub_admin (shared content-team surface, sees every block) plus Admin
# (read-only oversight — no write policy exists for admin on this table at all).
_SELECT_PREDICATE = """
    current_setting('app.role', true) = 'sub_admin'
    OR current_setting('app.role', true) = 'admin'
"""

# INSERT: only sub_admin, only as a fresh draft, only owning their own row.
_INSERT_CHECK = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
    AND status::text = 'draft'
"""

# UPDATE: sub_admin may edit/advance only their own block. Same shape as offers —
# no bypass-service transition to carve out, so RLS gates role + ownership and
# the forward-only machine lives in services/content.py.
_UPDATE_USING = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
"""
_UPDATE_CHECK = """
    created_by_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()

    content_status_enum = postgresql.ENUM(*_CONTENT_STATUS_VALUES, name="content_status")
    content_status_enum.create(bind)

    op.create_table(
        "content_blocks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("section", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        # NULL = cross-line/global content (spec §5.3) — the one Sub Admin
        # content table where the line tag is optional.
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=True,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*_CONTENT_STATUS_VALUES, name="content_status", create_type=False),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("created_by_uuid", sa.UUID(), nullable=False),
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
            name=op.f("fk_content_blocks_created_by_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_content_blocks")),
        sa.UniqueConstraint("slug", name=op.f("uq_content_blocks_slug")),
    )
    op.create_index(
        op.f("ix_content_blocks_created_by_uuid"), "content_blocks", ["created_by_uuid"]
    )
    op.create_index(op.f("ix_content_blocks_status"), "content_blocks", ["status"])

    op.execute(
        f"CREATE TRIGGER trg_content_blocks_business_line_immutable "
        f"BEFORE UPDATE ON content_blocks "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    # No DELETE grant — archive is the terminal state, rows are never removed.
    op.execute("GRANT SELECT, INSERT, UPDATE ON content_blocks TO api_user")
    op.execute("ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY content_blocks_select ON content_blocks
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY content_blocks_insert ON content_blocks
        FOR INSERT
        WITH CHECK ({_INSERT_CHECK});
        """
    )
    op.execute(
        f"""
        CREATE POLICY content_blocks_update ON content_blocks
        FOR UPDATE
        USING ({_UPDATE_USING})
        WITH CHECK ({_UPDATE_CHECK});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS content_blocks_update ON content_blocks")
    op.execute("DROP POLICY IF EXISTS content_blocks_insert ON content_blocks")
    op.execute("DROP POLICY IF EXISTS content_blocks_select ON content_blocks")
    op.execute("ALTER TABLE content_blocks DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON content_blocks FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_content_blocks_business_line_immutable ON content_blocks"
    )
    op.drop_index(op.f("ix_content_blocks_status"), table_name="content_blocks")
    op.drop_index(op.f("ix_content_blocks_created_by_uuid"), table_name="content_blocks")
    op.drop_table("content_blocks")
    postgresql.ENUM(name="content_status").drop(op.get_bind())
