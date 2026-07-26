"""add push_subscriptions table + RLS

Revision ID: f4e5d6c7b8a9
Revises: a0b1c2d3e4f5
Create Date: 2026-07-26 07:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004). No enum is added by this
migration, so unlike ADR-0004's enum-OID-cache case, no rolling restart of
api/scheduler is required after applying it.

push_subscriptions is written and read ONLY via the bypass superuser session
(services/push.py), same mechanism as services.notifications.emit_notification
— NOT via api_user's RLS-scoped request session, despite subscribe/unsubscribe
being user-facing self-service. This was a deliberate correction during
implementation: a shared/reused browser hands back the SAME push endpoint
across different logged-in accounts, so re-subscribing must be able to
reassign a row from user A to user B, and an owner-only RLS policy blocks
user B's own session from ever seeing user A's existing row to update it
("new row violates row-level security policy" on the ON CONFLICT path).
api_user therefore gets NO grants at all on this table (stricter than
notifications' SELECT+UPDATE) — every access, read and write alike, goes
through the bypass session, with the route itself as the authorization
boundary (current_user.id from the verified JWT, never client-supplied).

RLS is still enabled with an owner-only policy and NO platform_scope
admin-bypass branch, as defense-in-depth against a future api_user-session
query being added to this table by mistake — see
models/push_subscription.py docstring.

`endpoint` is UNIQUE (not `(user_uuid, endpoint)`): a shared/reused browser
returns the SAME endpoint across different logged-in accounts, so the
subscribe route upserts on conflict(endpoint) rather than inserting a
duplicate.

Rollback: drop policy, disable RLS, drop table (drops indexes and the
unique constraint with it).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f4e5d6c7b8a9"
down_revision: str | Sequence[str] | None = "a0b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RLS_PREDICATE = "user_uuid::text = current_setting('app.auth_user_uuid', true)"


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_uuid", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
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
            ["user_uuid"],
            ["auth_users.id"],
            name=op.f("fk_push_subscriptions_user_uuid_auth_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_subscriptions")),
        sa.UniqueConstraint("endpoint", name=op.f("uq_push_subscriptions_endpoint")),
    )
    op.create_index(
        op.f("ix_push_subscriptions_user_uuid"),
        "push_subscriptions",
        ["user_uuid"],
    )

    # No GRANT to api_user: this table is bypass-session-only (see module
    # docstring). RLS + policy remain enabled purely as defense-in-depth.
    op.execute("ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY push_subscriptions_rls ON push_subscriptions
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS push_subscriptions_rls ON push_subscriptions")
    op.execute("ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY")
    op.drop_table("push_subscriptions")
