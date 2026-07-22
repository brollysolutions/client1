"""add notifications table + enum + RLS

Revision ID: 6f7a8b9c1d2e
Revises: 5e6f7a8b9c1d
Create Date: 2026-07-21 01:30:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

notifications is an IDENTITY-level, account-level feed: like support_tickets
(3c4d5e6f7a8b), it has NO business_line column (an account gets notified
regardless of which line the triggering event belongs to) and the RLS owner
branch keys on app.auth_user_uuid.

Every row today is written by the emit_notification bypass-session helper
(services/notifications.py), hooked into site-visit and support-ticket
creation/cancellation — never by the client-facing router. api_user (the
role every authenticated request runs as) therefore only needs SELECT (list,
unread-count) and UPDATE (mark read / read-all); it is deliberately NOT
granted INSERT, since it never inserts a row (least privilege, matching how
support_tickets withholds UPDATE/DELETE until an endpoint uses them). The
superuser session the producer runs on bypasses grants entirely, so this
restriction doesn't affect it.

WITH CHECK is identical to USING from day one (leads "D1" lesson,
d4a1b2c3e5f6) even though api_user never inserts, for consistency with every
other RLS policy in this codebase.

Rollback: drop policy, disable RLS, revoke grant, drop table (drops
indexes), drop enum.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "6f7a8b9c1d2e"
down_revision: str | Sequence[str] | None = "5e6f7a8b9c1d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TYPE_VALUES = ("site_visit_requested", "site_visit_cancelled", "support_ticket_received")

# Identity-level owner predicate only (support_tickets shape): own
# notifications, or platform Admin/Sub Admin. No business_line/staff branch.
_RLS_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()

    type_enum = postgresql.ENUM(*_TYPE_VALUES, name="notification_type")
    type_enum.create(bind)

    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "type",
            postgresql.ENUM(*_TYPE_VALUES, name="notification_type", create_type=False),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("href", sa.String(length=300), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_notifications_user_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index(
        op.f("ix_notifications_user_uuid_created_at"),
        "notifications",
        ["user_uuid", "created_at"],
    )
    op.create_index(
        "ix_notifications_unread",
        "notifications",
        ["user_uuid"],
        postgresql_where=sa.text("read_at IS NULL"),
    )

    op.execute("GRANT SELECT, UPDATE ON notifications TO api_user")
    op.execute("ALTER TABLE notifications ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY notifications_rls ON notifications
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS notifications_rls ON notifications")
    op.execute("ALTER TABLE notifications DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, UPDATE ON notifications FROM api_user")
    op.drop_table("notifications")
    postgresql.ENUM(name="notification_type").drop(op.get_bind())
