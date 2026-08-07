"""add support-assisted mobile-number change workflow

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c7
Create Date: 2026-08-07 00:00:00.000000

Replacement-number OTP verification creates an identity-level request.  Only
the bypass service can write it; api_user receives SELECT so the target account
and platform Admin have a defense-in-depth read policy.  Maker/checker actions
remain application-gated and are written on the bypass transaction because
completion touches several tables with deliberately narrow RLS grants.

Audit/notification enum labels are additive and intentionally remain after
downgrade, matching the repository's existing PostgreSQL enum policy.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e2f3a4b5c6d7"
down_revision: str | Sequence[str] | None = "d1e2f3a4b5c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""

_OWNER = "auth_user_uuid::text = current_setting('app.auth_user_uuid', true)"


def upgrade() -> None:
    op.add_column(
        "auth_users",
        sa.Column(
            "session_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )
    op.create_check_constraint(
        op.f("ck_auth_users_session_version_positive"),
        "auth_users",
        "session_version >= 1",
    )

    op.execute(
        "CREATE TYPE mobile_change_status AS ENUM "
        "('pending_review', 'pending_approval', 'completed', 'rejected', 'cancelled', 'expired')"
    )
    op.execute("CREATE TYPE mobile_change_source AS ENUM ('public', 'authenticated')")
    op.execute(
        "CREATE TYPE mobile_change_proof AS ENUM "
        "('verified_email', 'existing_kyc', 'staff_confirmation', 'in_person')"
    )
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'mobile_change_verified'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'mobile_changed'")
    op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'mobile_change_rejected'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mobile_change_requested'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mobile_changed'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mobile_change_rejected'")

    op.create_table(
        "mobile_change_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("support_ticket_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "source",
            postgresql.ENUM(
                "public", "authenticated", name="mobile_change_source", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending_review",
                "pending_approval",
                "completed",
                "rejected",
                "cancelled",
                "expired",
                name="mobile_change_status",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'pending_review'::mobile_change_status"),
        ),
        sa.Column("current_mobile", sa.String(length=20), nullable=True),
        sa.Column("requested_mobile", sa.String(length=20), nullable=True),
        sa.Column("requested_mobile_verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "proof_method",
            postgresql.ENUM(
                "verified_email",
                "existing_kyc",
                "staff_confirmation",
                "in_person",
                name="mobile_change_proof",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("proof_attestation", sa.String(length=300), nullable=True),
        sa.Column("verified_by_user_uuid", sa.UUID(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by_user_uuid", sa.UUID(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by_user_uuid", sa.UUID(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
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
        sa.CheckConstraint(
            "current_mobile IS NULL OR requested_mobile IS NULL "
            "OR current_mobile <> requested_mobile",
            name=op.f("ck_mobile_change_requests_different_numbers"),
        ),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_mobile_change_requests_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["support_ticket_uuid"],
            ["support_tickets.id"],
            name=op.f("fk_mobile_change_requests_support_ticket_uuid_support_tickets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_mobile_change_requests_verified_by_user_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["completed_by_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_mobile_change_requests_completed_by_user_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["rejected_by_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_mobile_change_requests_rejected_by_user_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mobile_change_requests")),
        sa.UniqueConstraint(
            "support_ticket_uuid",
            name=op.f("uq_mobile_change_requests_support_ticket_uuid"),
        ),
    )
    op.create_index(
        op.f("ix_mobile_change_requests_auth_user_uuid"),
        "mobile_change_requests",
        ["auth_user_uuid"],
    )
    op.create_index(
        op.f("ix_mobile_change_requests_created_at"),
        "mobile_change_requests",
        ["created_at"],
    )
    op.create_index(
        "uq_mobile_change_active_target",
        "mobile_change_requests",
        ["auth_user_uuid"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending_review', 'pending_approval')"),
    )
    op.create_index(
        "uq_mobile_change_active_requested",
        "mobile_change_requests",
        ["requested_mobile"],
        unique=True,
        postgresql_where=sa.text(
            "requested_mobile IS NOT NULL AND status IN ('pending_review', 'pending_approval')"
        ),
    )

    op.execute("GRANT SELECT ON mobile_change_requests TO api_user")
    op.execute("ALTER TABLE mobile_change_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE mobile_change_requests FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY mobile_change_requests_select ON mobile_change_requests "
        f"FOR SELECT USING (({_ADMIN}) OR ({_OWNER}))"
    )


def downgrade() -> None:
    op.execute("REVOKE ALL PRIVILEGES ON mobile_change_requests FROM api_user")
    op.drop_index("uq_mobile_change_active_requested", table_name="mobile_change_requests")
    op.drop_index("uq_mobile_change_active_target", table_name="mobile_change_requests")
    op.drop_index(op.f("ix_mobile_change_requests_created_at"), table_name="mobile_change_requests")
    op.drop_index(
        op.f("ix_mobile_change_requests_auth_user_uuid"), table_name="mobile_change_requests"
    )
    op.drop_table("mobile_change_requests")
    op.execute("DROP TYPE mobile_change_proof")
    op.execute("DROP TYPE mobile_change_source")
    op.execute("DROP TYPE mobile_change_status")
    op.drop_constraint(op.f("ck_auth_users_session_version_positive"), "auth_users", type_="check")
    op.drop_column("auth_users", "session_version")
