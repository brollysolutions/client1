"""add offers table + enum + RLS (Sub Admin content, slice 2)

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-07-24 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL + GRANT
+ RLS policy require a direct connection — ADR-0004).

offers is the second of four Sub Admin content tables (SubAdmin_Dashboard_System_
Design.md §5.2) and repeats banners' (a4b5c6d7e8f9) narrow positive RLS allowlist
pattern. Unlike banners, offers has NO Admin-approval gate (spec §4.2/§6.3/§7 —
sub_admin owns the entire lifecycle: draft -> scheduled -> active -> archived, plus
a reserved `expired` value with no writer this slice). Admin keeps read-only
visibility for oversight (same SELECT-only addition as banners), but there is no
bypass-service mutation here at all — every write, including the lifecycle-advance
actions, runs on the request session under RLS. Status-direction (forward-only) is
enforced in the app layer (services.offers), not RLS; RLS only walls off
non-owners/non-sub_admins.

business_line is NOT NULL here even though the Sub Admin role itself is platform-
scoped/cross-line: individual offers are line-tagged for customer-facing filtering
(spec §2, "every artifact is line-tagged"). Immutable via the shared
enforce_business_line_immutable() trigger (e5f6a7b8c9d0), same as banners.

discount_type is plain TEXT (not an enum) per spec §5.2 — percentage/flat/
cashback-tie, validated at the Pydantic schema layer.

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop table
(drops index + FK), drop enum. The shared trigger FUNCTION is not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b5c6d7e8f9a0"
down_revision: str | Sequence[str] | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OFFER_STATUS_VALUES = ("draft", "scheduled", "active", "expired", "archived")
_FN = "enforce_business_line_immutable"

# SELECT: sub_admin (shared content-team surface, sees every offer) plus Admin
# (read-only oversight — no write policy exists for admin on this table at all).
_SELECT_PREDICATE = """
    current_setting('app.role', true) = 'sub_admin'
    OR current_setting('app.role', true) = 'admin'
"""

# INSERT: only sub_admin, and only ever as a fresh draft.
_INSERT_CHECK = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
    AND status::text = 'draft'
"""

# UPDATE: sub_admin may edit/advance only their own offer. Unlike banners there is
# no bypass-service transition to carve out — the forward-only status machine
# (draft -> scheduled -> active -> archived) is entirely app-layer-guarded
# (services.offers.advance_offer); RLS only gates ownership + role here.
_UPDATE_USING = """
    current_setting('app.role', true) = 'sub_admin'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
"""
_UPDATE_CHECK = """
    created_by_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()

    offer_status_enum = postgresql.ENUM(*_OFFER_STATUS_VALUES, name="offer_status")
    offer_status_enum.create(bind)

    op.create_table(
        "offers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("discount_type", sa.Text(), nullable=False),
        sa.Column("discount_value", sa.Numeric(), nullable=False),
        sa.Column("code", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(*_OFFER_STATUS_VALUES, name="offer_status", create_type=False),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("created_by_uuid", sa.UUID(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_offers_created_by_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offers")),
    )
    op.create_index(op.f("ix_offers_created_by_uuid"), "offers", ["created_by_uuid"])
    op.create_index(op.f("ix_offers_status"), "offers", ["status"])

    op.execute(
        f"CREATE TRIGGER trg_offers_business_line_immutable "
        f"BEFORE UPDATE ON offers "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    # No DELETE grant. UPDATE is granted since every lifecycle advance (schedule/
    # activate/archive) is a real RLS-covered UPDATE — there is no bypass session
    # for offers at all (contrast banners' approval transition).
    op.execute("GRANT SELECT, INSERT, UPDATE ON offers TO api_user")
    op.execute("ALTER TABLE offers ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY offers_select ON offers
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY offers_insert ON offers
        FOR INSERT
        WITH CHECK ({_INSERT_CHECK});
        """
    )
    op.execute(
        f"""
        CREATE POLICY offers_update ON offers
        FOR UPDATE
        USING ({_UPDATE_USING})
        WITH CHECK ({_UPDATE_CHECK});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS offers_update ON offers")
    op.execute("DROP POLICY IF EXISTS offers_insert ON offers")
    op.execute("DROP POLICY IF EXISTS offers_select ON offers")
    op.execute("ALTER TABLE offers DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON offers FROM api_user")
    op.execute("DROP TRIGGER IF EXISTS trg_offers_business_line_immutable ON offers")
    op.drop_index(op.f("ix_offers_status"), table_name="offers")
    op.drop_index(op.f("ix_offers_created_by_uuid"), table_name="offers")
    op.drop_table("offers")
    postgresql.ENUM(name="offer_status").drop(op.get_bind())
