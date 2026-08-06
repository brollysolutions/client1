"""add Admin field visibility controls and Employee contact share links

Revision ID: d1e2f3a4b5c7
Revises: c0d1e2f3a4b5
Create Date: 2026-08-06 00:00:00.000000

FR-2.9/FR-15.1/FR-15.4 require Admin-controlled response projection while
preserving the fixed rule that Agents see their own leads' numbers and
Telecallers see assigned leads' numbers.  The config table contains only
closed-catalogue overrides; application validation rejects arbitrary keys.

Employee share links contain no PII.  Only SHA-256 token hashes are persisted,
and RLS limits Employee rows to links they created for a task currently assigned
to their own same-line profile.  Platform Admin may revoke links when policy
changes.  Public validation uses the existing internal service-session pattern
and never exposes the linked lead or contact value; the service rechecks the
current task assignment, active Employee profile, and business line.

The audit enum label is additive and intentionally remains after downgrade,
matching every existing audit-action migration.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d1e2f3a4b5c7"
down_revision: str | Sequence[str] | None = "c0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""

_CONFIG_SELECT = f"""
    ({_ADMIN})
    OR target_role::text = current_setting('app.role', true)
"""

_EMPLOYEE_LINK = """
    current_setting('app.role', true) = 'employee'
    AND created_by_uuid::text = current_setting('app.auth_user_uuid', true)
    AND EXISTS (
        SELECT 1
        FROM tasks t
        WHERE t.id = task_uuid
          AND t.lead_uuid = lead_uuid
          AND t.assigned_employee_profile_uuid::text =
              current_setting('app.staff_profile_uuid', true)
          AND t.business_line::text = current_setting('app.business_line', true)
    )
"""

_EMPLOYEE_LINK_INSERT = f"""
    ({_EMPLOYEE_LINK})
    AND EXISTS (
        SELECT 1
        FROM tasks t
        WHERE t.id = task_uuid
          AND t.status::text IN ('assigned', 'in_progress', 'blocked')
    )
    AND EXISTS (
        SELECT 1
        FROM field_visibility_config f
        WHERE f.target_role::text = 'employee'
          AND f.entity = 'lead'
          AND f.field_key = 'mobile'
          AND f.mode::text = 'share_link'
    )
"""


def upgrade() -> None:
    op.execute("CREATE TYPE field_target_role AS ENUM ('agent', 'telecaller', 'employee')")
    op.execute("CREATE TYPE field_visibility_mode AS ENUM ('allow', 'deny', 'share_link')")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'field_visibility_updated'")

    op.create_table(
        "field_visibility_config",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "target_role",
            postgresql.ENUM(
                "agent", "telecaller", "employee", name="field_target_role", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("entity", sa.Text(), nullable=False),
        sa.Column("field_key", sa.Text(), nullable=False),
        sa.Column(
            "mode",
            postgresql.ENUM(
                "allow", "deny", "share_link", name="field_visibility_mode", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("updated_by_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_field_visibility_config_updated_by_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_field_visibility_config")),
        sa.UniqueConstraint(
            "target_role",
            "entity",
            "field_key",
            name="uq_field_visibility_config_role_entity_field",
        ),
    )
    op.create_table(
        "contact_share_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("task_uuid", sa.UUID(), nullable=False),
        sa.Column("lead_uuid", sa.UUID(), nullable=False),
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
            ["created_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_contact_share_links_created_by_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lead_uuid"],
            ["leads.id"],
            name=op.f("fk_contact_share_links_lead_uuid_leads"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_uuid"],
            ["tasks.id"],
            name=op.f("fk_contact_share_links_task_uuid_tasks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contact_share_links")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_contact_share_links_token_hash")),
    )
    op.create_index(
        "ix_contact_share_links_active_expiry",
        "contact_share_links",
        ["expires_at"],
        postgresql_where=sa.text("revoked_at IS NULL AND used_at IS NULL"),
    )
    op.create_index(
        "uq_contact_share_links_active_creator_task",
        "contact_share_links",
        ["task_uuid", "created_by_uuid"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL AND used_at IS NULL"),
    )
    op.create_index(
        op.f("ix_contact_share_links_task_uuid"),
        "contact_share_links",
        ["task_uuid"],
    )

    op.execute(
        "GRANT SELECT, INSERT, UPDATE (mode, updated_by_uuid, updated_at) "
        "ON field_visibility_config TO api_user"
    )
    op.execute("ALTER TABLE field_visibility_config ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE field_visibility_config FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY field_visibility_config_select ON field_visibility_config "
        f"FOR SELECT USING ({_CONFIG_SELECT})"
    )
    op.execute(
        "CREATE POLICY field_visibility_config_insert ON field_visibility_config "
        f"FOR INSERT WITH CHECK ({_ADMIN})"
    )
    op.execute(
        "CREATE POLICY field_visibility_config_update ON field_visibility_config "
        f"FOR UPDATE USING ({_ADMIN}) WITH CHECK ({_ADMIN})"
    )

    op.execute(
        "GRANT SELECT, INSERT, UPDATE (used_at, revoked_at) ON contact_share_links TO api_user"
    )
    op.execute("ALTER TABLE contact_share_links ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE contact_share_links FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY contact_share_links_select ON contact_share_links "
        f"FOR SELECT USING (({_ADMIN}) OR ({_EMPLOYEE_LINK}))"
    )
    op.execute(
        "CREATE POLICY contact_share_links_insert ON contact_share_links "
        f"FOR INSERT WITH CHECK ({_EMPLOYEE_LINK_INSERT})"
    )
    op.execute(
        "CREATE POLICY contact_share_links_update ON contact_share_links "
        f"FOR UPDATE USING (({_ADMIN}) OR ({_EMPLOYEE_LINK})) "
        f"WITH CHECK (({_ADMIN}) OR ({_EMPLOYEE_LINK}))"
    )


def downgrade() -> None:
    op.execute("REVOKE ALL PRIVILEGES ON contact_share_links FROM api_user")
    op.execute("REVOKE ALL PRIVILEGES ON field_visibility_config FROM api_user")
    op.drop_index(op.f("ix_contact_share_links_task_uuid"), table_name="contact_share_links")
    op.drop_index("uq_contact_share_links_active_creator_task", table_name="contact_share_links")
    op.drop_index("ix_contact_share_links_active_expiry", table_name="contact_share_links")
    op.drop_table("contact_share_links")
    op.drop_table("field_visibility_config")
    op.execute("DROP TYPE field_visibility_mode")
    op.execute("DROP TYPE field_target_role")
