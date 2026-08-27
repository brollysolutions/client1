"""add staff first-login invite links

Revision ID: b1f7c93ad204
Revises: 73f4c2a91d6e
Create Date: 2026-08-27 00:00:00.000000

Provisioning a staff account produced a one-time temp password that the Admin
had to relay out of band. This table backs a first-login link instead: the
invitee opens it and sets their own password, so the credential is never spoken,
pasted into chat, or left in an Admin's clipboard.

The row holds no PII — a SHA-256 token hash and three foreign keys. The raw
token exists only in the response that creates it and in the URL the Admin
shares, exactly as `contact_share_links` (d1e2f3a4b5c7) already works.

RLS is Admin-only. Consumption runs on the internal service session, the same
pattern `services/field_visibility.invitation_is_valid` uses, so no anonymous
policy is needed and the anonymous role is granted nothing here.

The partial unique index enforces at most one live link per invitee, so an
Admin re-issuing a link cannot leave two working credentials outstanding.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b1f7c93ad204"
down_revision: str | Sequence[str] | None = "73f4c2a91d6e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""


_NEW_AUDIT_ACTIONS = ("staff_invite_created", "staff_invite_revoked")


def upgrade() -> None:
    for value in _NEW_AUDIT_ACTIONS:
        op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'")

    op.create_table(
        "staff_invite_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("staff_profile_uuid", sa.UUID(), nullable=False),
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
            name=op.f("fk_staff_invite_links_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_staff_invite_links_staff_profile_uuid_staff_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_staff_invite_links_created_by_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_invite_links")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_staff_invite_links_token_hash")),
    )
    op.create_index(
        "ix_staff_invite_links_active_expiry",
        "staff_invite_links",
        ["expires_at"],
        postgresql_where=sa.text("revoked_at IS NULL AND used_at IS NULL"),
    )
    # At most one live link per invitee: re-issuing must replace, never add a
    # second working credential.
    op.create_index(
        "uq_staff_invite_links_active_user",
        "staff_invite_links",
        ["auth_user_uuid"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL AND used_at IS NULL"),
    )

    # UPDATE is column-scoped to the two lifecycle timestamps: neither an Admin
    # nor the consumption path may repoint a link at a different identity.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE (used_at, revoked_at) ON staff_invite_links TO api_user"
    )
    op.execute("ALTER TABLE staff_invite_links ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE staff_invite_links FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY staff_invite_links_select ON staff_invite_links FOR SELECT USING ({_ADMIN})"
    )
    op.execute(
        "CREATE POLICY staff_invite_links_insert ON staff_invite_links "
        f"FOR INSERT WITH CHECK ({_ADMIN})"
    )
    op.execute(
        "CREATE POLICY staff_invite_links_update ON staff_invite_links "
        f"FOR UPDATE USING ({_ADMIN}) WITH CHECK ({_ADMIN})"
    )


def downgrade() -> None:
    op.execute("REVOKE ALL PRIVILEGES ON staff_invite_links FROM api_user")
    op.drop_index("uq_staff_invite_links_active_user", table_name="staff_invite_links")
    op.drop_index("ix_staff_invite_links_active_expiry", table_name="staff_invite_links")
    op.drop_table("staff_invite_links")
