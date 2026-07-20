"""add support_tickets table + enums + RLS

Revision ID: 3c4d5e6f7a8b
Revises: 2b3c4d5e6f7a
Create Date: 2026-07-20 15:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

support_tickets is an IDENTITY-level client-owned table (help/recovery requests):
line-agnostic, so it has NO business_line column and the RLS owner branch keys on
app.auth_user_uuid, mirroring auth_events_rls / agent_applications_rls in
f2e4d6c8a0b1 — NOT the client_profile_uuid shape used by loans/leads. This is the
first client-facing feature table on the identity key; that is deliberate (a
ticket belongs to the account, not a business line).

Grants SELECT + INSERT only (the client lists and raises tickets). UPDATE/DELETE
are withheld until a ticket-edit/close endpoint actually ships — least privilege,
matching how loan_applications (2b3c4d5e6f7a) grants only what its endpoints use.
WITH CHECK is identical to USING from day one (leads "D1" lesson, d4a1b2c3e5f6).

Rollback: drop policy, disable RLS, revoke grant, drop table (drops indexes),
drop enums.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "3c4d5e6f7a8b"
down_revision: str | Sequence[str] | None = "2b3c4d5e6f7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CATEGORY_VALUES = ("account_login", "otp", "lost_mobile", "general")
_STATUS_VALUES = ("open", "in_progress", "resolved", "closed")

# Identity-level owner predicate: own tickets, or platform Admin/Sub Admin.
_RLS_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()

    category = postgresql.ENUM(*_CATEGORY_VALUES, name="support_category")
    category.create(bind)
    ticket_status = postgresql.ENUM(*_STATUS_VALUES, name="support_status")
    ticket_status.create(bind)

    op.create_table(
        "support_tickets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auth_user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "category",
            postgresql.ENUM(*_CATEGORY_VALUES, name="support_category", create_type=False),
            nullable=False,
        ),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="support_status", create_type=False),
            nullable=False,
            server_default="open",
        ),
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
            ["auth_user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_support_tickets_auth_user_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_tickets")),
    )
    op.create_index(
        op.f("ix_support_tickets_auth_user_uuid"),
        "support_tickets",
        ["auth_user_uuid"],
    )

    op.execute("GRANT SELECT, INSERT ON support_tickets TO api_user")
    op.execute("ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY support_tickets_rls ON support_tickets
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS support_tickets_rls ON support_tickets")
    op.execute("ALTER TABLE support_tickets DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON support_tickets FROM api_user")
    op.drop_table("support_tickets")
    postgresql.ENUM(name="support_status").drop(op.get_bind())
    postgresql.ENUM(name="support_category").drop(op.get_bind())
