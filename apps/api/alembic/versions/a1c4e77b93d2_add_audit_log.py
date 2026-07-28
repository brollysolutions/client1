"""add audit_log table + audit_action enum + RLS

Revision ID: a1c4e77b93d2
Revises: 5b8d2432ac31
Create Date: 2026-07-28 07:10:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

`audit_log` is the Admin-owned business-action record (Admin design §5.6,
FR-11.3, NFR-2.3). It is deliberately distinct from `auth_events`
(f2e4d6c8a0b1): that table records authentication events, this one records
business actions — agent approved, payout executed, account removed, financial
records purged.

APPEND-ONLY, enforced by privilege rather than by application code: `api_user`
gets `SELECT, INSERT` and nothing else, so no amount of application-layer bug or
malice can rewrite or erase an entry — there is no UPDATE/DELETE grant and no
UPDATE/DELETE policy for those commands to even be evaluated against. This is
the same least-privilege reasoning `3c4d5e6f7a8b` used to withhold UPDATE on
support_tickets, except here the withholding is permanent by design rather than
"until an endpoint ships".

RLS uses TWO per-command policies rather than the usual single `FOR ALL` policy
with identical USING/WITH CHECK (the leads "D1" lesson, d4a1b2c3e5f6). That
convention exists so a row you can see is a row you can write; it does not apply
here because reading and writing this table are legitimately different rights:

  * `audit_log_select` — full Admin only (`platform_scope='true' AND
    role='admin'`). Sub Admin is excluded on purpose, unlike `content_blocks`
    where Admin/Sub Admin share a content surface: several audited actions ARE
    Sub Admin actions (payout maker-checker, property-submission review), and an
    oversight record the overseen party can read is a weaker control. Sub Admin
    has no read path to this table at all.

  * `audit_log_insert` — any authenticated role, but only truthfully: WITH CHECK
    pins `actor_uuid` to the caller's own `app.auth_user_uuid`, so a session
    cannot attribute an action to somebody else. A broad role allowance is
    required, not sloppiness: self-service account deletion (`DELETE
    /api/v1/auth/me`) is performed by the *client* on their own request-scoped
    session, so restricting INSERT to staff roles would make that action the one
    irreversible thing on the platform that goes unrecorded.

Scheduler jobs (`jobs/retention_purge.py`) write with `actor_uuid = NULL` on a
superuser session that bypasses RLS entirely, so the own-actor WITH CHECK never
applies to them — NULL actor means "the platform did this on a schedule".

There is deliberately no `business_line` immutability trigger
(`enforce_business_line_immutable`, e5f6a7b8c9d0) and no line predicate in the
policies. Both would be decoration on an append-only, Admin-only table: rows are
never updated, so nothing can mutate the line tag, and Admin bypasses the line
filter everywhere else by design.

Indexes are chosen for the two real read patterns: the reverse-chronological
Admin feed (`created_at DESC`), and per-target history ("what happened to this
payout"), plus the two list filters the endpoint exposes (action, actor).

Rollback: drop both policies, disable RLS, revoke grants, drop table (drops its
indexes), drop enum. Nothing else references `audit_log`, so this is clean —
though dropping the table destroys the audit history it exists to preserve, so
in production prefer leaving it in place.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1c4e77b93d2"
down_revision: str | Sequence[str] | None = "5b8d2432ac31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTION_VALUES = (
    "agent_approved",
    "agent_rejected",
    "staff_created",
    "account_removed",
    "payout_approved",
    "payout_rejected",
    "property_submission_approved",
    "property_submission_rejected",
    "support_ticket_advanced",
    "retention_purged",
)

# Read: full Admin only. Sub Admin is intentionally not included — see docstring.
_SELECT_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""

# Write: any authenticated role, but only as itself. A NULL actor is rejected
# here by design (NULL::text = ... is NULL, not true, so the check fails) —
# system rows are written on the RLS-bypassing superuser session instead, which
# keeps "no actor" impossible to forge from a request-scoped session.
_INSERT_CHECK = """
    actor_uuid::text = current_setting('app.auth_user_uuid', true)
"""


def upgrade() -> None:
    bind = op.get_bind()

    action_enum = postgresql.ENUM(*_ACTION_VALUES, name="audit_action")
    action_enum.create(bind)

    op.create_table(
        "audit_log",
        sa.Column("id", sa.UUID(), nullable=False),
        # NULL = written by a scheduler job, no human actor.
        sa.Column("actor_uuid", sa.UUID(), nullable=True),
        # The actor's role AS OF the action. Denormalized on purpose: joining to
        # the profile tables at read time would report today's role, letting a
        # later promotion or demotion silently rewrite history.
        sa.Column("actor_role", sa.Text(), nullable=True),
        sa.Column(
            "action",
            postgresql.ENUM(*_ACTION_VALUES, name="audit_action", create_type=False),
            nullable=False,
        ),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_uuid", sa.UUID(), nullable=True),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=True,
        ),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # SET NULL, matching auth_events.auth_user_uuid: account deletion
        # tombstones auth_users rather than deleting rows, so this is a backstop.
        # An audit row must outlive its actor either way.
        sa.ForeignKeyConstraint(
            ["actor_uuid"],
            ["auth_users.id"],
            name=op.f("fk_audit_log_actor_uuid_auth_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_log")),
    )

    # Reverse-chronological feed — the default list query.
    op.execute("CREATE INDEX ix_audit_log_created_at_desc ON audit_log (created_at DESC)")
    # "What happened to this record" — per-target history.
    op.create_index(
        "ix_audit_log_entity",
        "audit_log",
        ["entity_type", "entity_uuid"],
    )
    # The two list filters the endpoint exposes.
    op.create_index(op.f("ix_audit_log_action"), "audit_log", ["action"])
    op.create_index(op.f("ix_audit_log_actor_uuid"), "audit_log", ["actor_uuid"])

    # Append-only: SELECT + INSERT, never UPDATE or DELETE. See docstring.
    op.execute("GRANT SELECT, INSERT ON audit_log TO api_user")
    op.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY audit_log_select ON audit_log
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY audit_log_insert ON audit_log
        FOR INSERT
        WITH CHECK ({_INSERT_CHECK});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS audit_log_insert ON audit_log")
    op.execute("DROP POLICY IF EXISTS audit_log_select ON audit_log")
    op.execute("ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON audit_log FROM api_user")
    op.drop_table("audit_log")
    postgresql.ENUM(name="audit_action").drop(op.get_bind())
