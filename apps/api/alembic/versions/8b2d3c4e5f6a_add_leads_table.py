"""add leads table (capture spine) + enums + RLS

Revision ID: 8b2d3c4e5f6a
Revises: 7a1c2b3d4e5f
Create Date: 2026-06-30 20:35:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL + role
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

Every enquiring mobile is captured here (register/initiate, login, forgot/initiate)
even if the user never finishes. Capture is an idempotent upsert anchored on the
partial-unique index over active leads. RLS mirrors client_profiles: platform Admin
bypass, own claimed lead (client_profile_uuid), and line-scoped staff/telecaller.

Rollback: drop policy, disable RLS, revoke grant, drop table (drops indexes), drop enums.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "8b2d3c4e5f6a"
down_revision: str | Sequence[str] | None = "7a1c2b3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE_PREDICATE = "status NOT IN ('closed', 'released')"


def upgrade() -> None:
    bind = op.get_bind()

    # -- enums (create_type=True here; the model uses create_type=False) --
    lead_origin = postgresql.ENUM("direct", "agent", name="lead_origin")
    lead_origin.create(bind)
    lead_status = postgresql.ENUM(
        "new", "assigned", "working", "converted", "closed", "released", name="lead_status"
    )
    lead_status.create(bind)

    op.create_table(
        "leads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("client_profile_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=True,
        ),
        sa.Column(
            "origin",
            postgresql.ENUM("direct", "agent", name="lead_origin", create_type=False),
            nullable=False,
            server_default="direct",
        ),
        sa.Column("origin_agent_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("assigned_telecaller_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("mobile", sa.String(), nullable=False),
        sa.Column("requirement", postgresql.JSONB(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "new",
                "assigned",
                "working",
                "converted",
                "closed",
                "released",
                name="lead_status",
                create_type=False,
            ),
            nullable=False,
            server_default="new",
        ),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("release_reason", sa.String(), nullable=True),
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
            ["client_profile_uuid"],
            ["client_profiles.id"],
            name=op.f("fk_leads_client_profile_uuid_client_profiles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["origin_agent_profile_uuid"],
            ["agent_profiles.id"],
            name=op.f("fk_leads_origin_agent_profile_uuid_agent_profiles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_telecaller_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_leads_assigned_telecaller_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_leads")),
    )
    op.create_index(op.f("ix_leads_mobile"), "leads", ["mobile"])
    # Idempotency anchor for capture upserts: one active lead per mobile.
    op.create_index(
        "uq_leads_mobile_active",
        "leads",
        ["mobile"],
        unique=True,
        postgresql_where=sa.text(_ACTIVE_PREDICATE),
    )

    # -- RLS --
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO api_user")
    op.execute("ALTER TABLE leads ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY leads_rls ON leads
        FOR ALL
        USING (
            current_setting('app.platform_scope', true) = 'true'
            OR (
                client_profile_uuid IS NOT NULL
                AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
            )
            OR (
                current_setting('app.business_line', true) <> ''
                AND business_line::text = current_setting('app.business_line', true)
                AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
            )
        )
        WITH CHECK (
            current_setting('app.platform_scope', true) = 'true'
            OR (
                client_profile_uuid IS NOT NULL
                AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
            )
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS leads_rls ON leads")
    op.execute("ALTER TABLE leads DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON leads FROM api_user")
    op.drop_table("leads")
    postgresql.ENUM(name="lead_status").drop(op.get_bind())
    postgresql.ENUM(name="lead_origin").drop(op.get_bind())
