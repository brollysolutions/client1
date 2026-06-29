"""add profile and session tables

Revision ID: a3f2c1d4e5b6
Revises: 114766dba120
Create Date: 2026-06-29 12:00:00.000000

NOTE: Run this migration directly against postgres:5432, NOT through pgBouncer.
Enum DDL + prepared-statement caching require a direct connection (ADR-0004).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a3f2c1d4e5b6"
down_revision: str | Sequence[str] | None = "114766dba120"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- enums (create_type=True here; models use create_type=False) --
    profile_status = postgresql.ENUM(
        "active", "inactive", "pending", "suspended", name="profile_status"
    )
    profile_status.create(op.get_bind())

    staff_role_enum = postgresql.ENUM(
        "admin", "sub_admin", "telecaller", "employee", name="staff_role_enum"
    )
    staff_role_enum.create(op.get_bind())

    profile_scope_enum = postgresql.ENUM("platform", "line", name="profile_scope_enum")
    profile_scope_enum.create(op.get_bind())

    submission_status_enum = postgresql.ENUM(
        "pending", "approved", "rejected", name="submission_status_enum"
    )
    submission_status_enum.create(op.get_bind())

    # -- refresh_tokens --
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("replaced_by", sa.UUID(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("ip", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_refresh_tokens_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
    )

    # -- auth_events --
    op.create_table(
        "auth_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("mobile", sa.String(), nullable=True),
        sa.Column("ip", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_auth_events_auth_user_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_events")),
    )

    # -- staff_profiles --
    op.create_table(
        "staff_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM(
                "admin",
                "sub_admin",
                "telecaller",
                "employee",
                name="staff_role_enum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "scope",
            postgresql.ENUM("platform", "line", name="profile_scope_enum", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans",
                "real_estate",
                "both",
                name="business_line_enum",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("staff_code", sa.String(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "active",
                "inactive",
                "pending",
                "suspended",
                name="profile_status",
                create_type=False,
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column("created_by_auth_user_uuid", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_staff_profiles_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_staff_profiles_created_by_auth_user_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_profiles")),
        sa.UniqueConstraint("staff_code", name=op.f("uq_staff_profiles_staff_code")),
    )

    # -- client_profiles --
    op.create_table(
        "client_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans",
                "real_estate",
                "both",
                name="business_line_enum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("customer_code", sa.String(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "active",
                "inactive",
                "pending",
                "suspended",
                name="profile_status",
                create_type=False,
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_client_profiles_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_client_profiles")),
        sa.UniqueConstraint("customer_code", name=op.f("uq_client_profiles_customer_code")),
        sa.UniqueConstraint(
            "auth_user_uuid",
            "business_line",
            name=op.f("uq_client_profiles_auth_user_uuid_business_line"),
        ),
    )

    # -- agent_applications --
    op.create_table(
        "agent_applications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("applicant_auth_user_uuid", sa.UUID(), nullable=True),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("mobile", sa.String(), nullable=True),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans",
                "real_estate",
                "both",
                name="business_line_enum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("aadhaar_ref", sa.String(), nullable=True),
        sa.Column("pan_ref", sa.String(), nullable=True),
        sa.Column("photo_ref", sa.String(), nullable=True),
        sa.Column("address_proof_ref", sa.String(), nullable=True),
        sa.Column("rera_code", sa.String(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "approved",
                "rejected",
                name="submission_status_enum",
                create_type=False,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("reviewed_by_staff_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["applicant_auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_agent_applications_applicant_auth_user_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_agent_applications_reviewed_by_staff_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_applications")),
    )

    # -- agent_profiles --
    op.create_table(
        "agent_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column("agent_code", sa.String(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans",
                "real_estate",
                "both",
                name="business_line_enum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("application_uuid", sa.UUID(), nullable=True),
        sa.Column("converted_from_client", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("kyc_status", sa.String(), nullable=True),
        sa.Column("rera_code", sa.String(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "active",
                "inactive",
                "pending",
                "suspended",
                name="profile_status",
                create_type=False,
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column("approved_by_staff_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_agent_profiles_auth_user_uuid_auth_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["application_uuid"],
            ["agent_applications.id"],
            name=op.f("fk_agent_profiles_application_uuid_agent_applications"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["approved_by_staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_agent_profiles_approved_by_staff_profile_uuid_staff_profiles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_profiles")),
        sa.UniqueConstraint("agent_code", name=op.f("uq_agent_profiles_agent_code")),
    )


def downgrade() -> None:
    op.drop_table("agent_profiles")
    op.drop_table("agent_applications")
    op.drop_table("client_profiles")
    op.drop_table("staff_profiles")
    op.drop_table("auth_events")
    op.drop_table("refresh_tokens")

    postgresql.ENUM(name="submission_status_enum").drop(op.get_bind())
    postgresql.ENUM(name="profile_scope_enum").drop(op.get_bind())
    postgresql.ENUM(name="staff_role_enum").drop(op.get_bind())
    postgresql.ENUM(name="profile_status").drop(op.get_bind())
