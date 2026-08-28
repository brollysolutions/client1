"""guard provider deletion and add approved-Agent setup links

Revision ID: d3e5f7a9b1c4
Revises: c2d8e4f6a901
Create Date: 2026-08-28 13:30:00.000000

Provider deletion is available only to platform Admin and remains fail-closed
for historical loan applications and configured provider offers. Availability
rows are disposable configuration and retain their existing cascade.

Approved Agents receive short-lived, single-use setup links whose raw tokens
are never stored. Admin-only RLS policies protect link lifecycle operations;
anonymous consumption runs through the same tightly-scoped internal path used
by the established staff-invite flow.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d3e5f7a9b1c4"
down_revision: str | Sequence[str] | None = "c2d8e4f6a901"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in ("bank_deleted", "agent_invite_created", "agent_invite_revoked"):
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")

    op.drop_constraint(
        op.f("fk_loan_applications_bank_id_banks"),
        "loan_applications",
        type_="foreignkey",
    )
    op.create_foreign_key(
        op.f("fk_loan_applications_bank_id_banks"),
        "loan_applications",
        "banks",
        ["bank_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute("GRANT DELETE ON banks TO api_user")
    op.execute(f"CREATE POLICY banks_delete ON banks FOR DELETE USING ({_ADMIN})")

    op.create_table(
        "agent_invite_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("agent_profile_uuid", sa.UUID(), nullable=False),
        sa.Column("application_uuid", sa.UUID(), nullable=False),
        sa.Column("created_by_uuid", sa.UUID(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_agent_invite_links_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["agent_profile_uuid"],
            ["agent_profiles.id"],
            name=op.f("fk_agent_invite_links_agent_profile_uuid_agent_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["application_uuid"],
            ["agent_applications.id"],
            name=op.f("fk_agent_invite_links_application_uuid_agent_applications"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_agent_invite_links_created_by_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_invite_links")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_agent_invite_links_token_hash")),
    )
    op.create_index(
        "ix_agent_invite_links_active_expiry",
        "agent_invite_links",
        ["expires_at"],
        postgresql_where=sa.text("revoked_at IS NULL AND used_at IS NULL"),
    )
    op.create_index(
        "uq_agent_invite_links_active_user",
        "agent_invite_links",
        ["auth_user_uuid"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL AND used_at IS NULL"),
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE (used_at, revoked_at) ON agent_invite_links TO api_user"
    )
    op.execute("ALTER TABLE agent_invite_links ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE agent_invite_links FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY agent_invite_links_select ON agent_invite_links FOR SELECT USING ({_ADMIN})"
    )
    op.execute(
        "CREATE POLICY agent_invite_links_insert ON agent_invite_links "
        f"FOR INSERT WITH CHECK ({_ADMIN})"
    )
    op.execute(
        "CREATE POLICY agent_invite_links_update ON agent_invite_links "
        f"FOR UPDATE USING ({_ADMIN}) WITH CHECK ({_ADMIN})"
    )


def downgrade() -> None:
    op.execute("REVOKE ALL PRIVILEGES ON agent_invite_links FROM api_user")
    op.drop_index("uq_agent_invite_links_active_user", table_name="agent_invite_links")
    op.drop_index("ix_agent_invite_links_active_expiry", table_name="agent_invite_links")
    op.drop_table("agent_invite_links")

    op.execute("DROP POLICY IF EXISTS banks_delete ON banks")
    op.execute("REVOKE DELETE ON banks FROM api_user")
    op.drop_constraint(
        op.f("fk_loan_applications_bank_id_banks"),
        "loan_applications",
        type_="foreignkey",
    )
    op.create_foreign_key(
        op.f("fk_loan_applications_bank_id_banks"),
        "loan_applications",
        "banks",
        ["bank_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # PostgreSQL enum members are intentionally retained on downgrade.
