"""add referral_bonus_config table + RLS (Sub Admin content, slice 4)

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-07-25 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004).

referral_bonus_config is the fourth of four Sub Admin content tables
(SubAdmin_Dashboard_System_Design.md §5.4) and repeats the narrow positive RLS
allowlist proven by banners (a4b5c6d7e8f9), offers (b5c6d7e8f9a0) and
content_blocks (d7e8f9a0b1c2). Sub Admin administers the bonus RULES only —
amounts, conditions, caps — never the payout itself. Payout execution stays
Admin/finance's, written through the existing `transactions` ledger by a
producer that does not exist yet; this table has no FK or trigger tying it to
`transactions` rows, and no router in this slice writes to `transactions` at
all (that table's own RLS was already narrowed for sub_admin's read-only
oversight in e8f9a0b1c2d3, scoped to `type = 'referral_bonus'`).

Unlike offers/content_blocks there is no forward-only status machine here —
`active` is a plain boolean toggle, not an enum, so there is no
services/referral_bonus.py transition module beyond simple CRUD (spec §5.4
lists no status column at all).

business_line is NOT NULL (spec §5.4) even though the Sub Admin role itself is
platform-scoped/cross-line: individual configs are line-tagged, matching
banners/offers. Immutable via the shared enforce_business_line_immutable()
trigger (e5f6a7b8c9d0).

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop table
(drops indexes + FK). The shared trigger FUNCTION is not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: str | Sequence[str] | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"

# SELECT: sub_admin (shared content-team surface, sees every config) plus Admin
# (read-only oversight — no write policy exists for admin on this table at all).
_SELECT_PREDICATE = """
    current_setting('app.role', true) = 'sub_admin'
    OR current_setting('app.role', true) = 'admin'
"""

# INSERT: only sub_admin, only owning their own row.
_INSERT_CHECK = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
"""

# UPDATE: sub_admin may edit only their own config. No status-direction axis to
# gate (no enum here), so ownership is the only RLS-enforced write predicate,
# same shape as offers' UPDATE.
_UPDATE_USING = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
"""
_UPDATE_CHECK = """
    created_by_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    op.create_table(
        "referral_bonus_config",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("bonus_amount", sa.Numeric(), nullable=False),
        sa.Column(
            "rule", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.false()),
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
            name=op.f("fk_referral_bonus_config_created_by_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_referral_bonus_config")),
    )
    op.create_index(
        op.f("ix_referral_bonus_config_created_by_uuid"),
        "referral_bonus_config",
        ["created_by_uuid"],
    )
    op.create_index(op.f("ix_referral_bonus_config_active"), "referral_bonus_config", ["active"])

    op.execute(
        f"CREATE TRIGGER trg_referral_bonus_config_business_line_immutable "
        f"BEFORE UPDATE ON referral_bonus_config "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT, UPDATE ON referral_bonus_config TO api_user")
    op.execute("ALTER TABLE referral_bonus_config ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY referral_bonus_config_select ON referral_bonus_config
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY referral_bonus_config_insert ON referral_bonus_config
        FOR INSERT
        WITH CHECK ({_INSERT_CHECK});
        """
    )
    op.execute(
        f"""
        CREATE POLICY referral_bonus_config_update ON referral_bonus_config
        FOR UPDATE
        USING ({_UPDATE_USING})
        WITH CHECK ({_UPDATE_CHECK});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS referral_bonus_config_update ON referral_bonus_config")
    op.execute("DROP POLICY IF EXISTS referral_bonus_config_insert ON referral_bonus_config")
    op.execute("DROP POLICY IF EXISTS referral_bonus_config_select ON referral_bonus_config")
    op.execute("ALTER TABLE referral_bonus_config DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON referral_bonus_config FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_referral_bonus_config_business_line_immutable "
        "ON referral_bonus_config"
    )
    op.drop_index(op.f("ix_referral_bonus_config_active"), table_name="referral_bonus_config")
    op.drop_index(
        op.f("ix_referral_bonus_config_created_by_uuid"), table_name="referral_bonus_config"
    )
    op.drop_table("referral_bonus_config")
