"""add lead_activities table (manual call log) + enums + RLS

Revision ID: d5b6c7a8f9e0
Revises: c3d4e5f6a7b8
Create Date: 2026-07-22 12:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL + GRANT
+ RLS policy + trigger require a direct connection — ADR-0004).

lead_activities is the manual replacement for the removed cloud-telephony webhook
call log (Telecaller_Dashboard_System_Design.md §1.1/§5.1): one row per call
attempt, own-rows-only RLS (no line-staff branch — a telecaller's call log is
never visible to another telecaller, even on the same line), platform Admin
bypass. No UPDATE/DELETE grant: a call log is an immutable attempt record, same
posture as property_submissions. business_line is immutable via the shared
enforce_business_line_immutable() trigger (e5f6a7b8c9d0).

Rollback: drop policy, disable RLS, revoke grant, drop trigger, drop table (drops
indexes + FKs), drop enums. The shared trigger FUNCTION is not touched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d5b6c7a8f9e0"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"

# Own rows only: no line-staff branch. A telecaller's call log is private to them
# (design doc §7) even though the parent lead is visible to whole-line staff.
_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND telecaller_staff_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
    )
"""


def upgrade() -> None:
    bind = op.get_bind()

    call_disposition = postgresql.ENUM(
        "connected",
        "no_answer",
        "busy",
        "switched_off",
        "wrong_number",
        "callback_requested",
        "not_interested",
        name="call_disposition",
    )
    call_disposition.create(bind)
    interest_level = postgresql.ENUM("hot", "warm", "cold", name="interest_level")
    interest_level.create(bind)

    op.create_table(
        "lead_activities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lead_uuid", sa.UUID(), nullable=False),
        sa.Column("telecaller_staff_profile_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "disposition",
            postgresql.ENUM(
                "connected",
                "no_answer",
                "busy",
                "switched_off",
                "wrong_number",
                "callback_requested",
                "not_interested",
                name="call_disposition",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "interest_level",
            postgresql.ENUM("hot", "warm", "cold", name="interest_level", create_type=False),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["lead_uuid"],
            ["leads.id"],
            name=op.f("fk_lead_activities_lead_uuid_leads"),
        ),
        sa.ForeignKeyConstraint(
            ["telecaller_staff_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_lead_activities_telecaller_staff_profile_uuid_staff_profiles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lead_activities")),
    )
    op.create_index(op.f("ix_lead_activities_lead_uuid"), "lead_activities", ["lead_uuid"])
    op.create_index(
        op.f("ix_lead_activities_telecaller_staff_profile_uuid"),
        "lead_activities",
        ["telecaller_staff_profile_uuid"],
    )
    op.create_index(op.f("ix_lead_activities_follow_up_at"), "lead_activities", ["follow_up_at"])

    op.execute(
        f"CREATE TRIGGER trg_lead_activities_business_line_immutable "
        f"BEFORE UPDATE ON lead_activities "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    # No UPDATE/DELETE grant: a call log is an immutable attempt record.
    op.execute("GRANT SELECT, INSERT ON lead_activities TO api_user")
    op.execute("ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY lead_activities_rls ON lead_activities
        FOR ALL
        USING ({_PREDICATE})
        WITH CHECK ({_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS lead_activities_rls ON lead_activities")
    op.execute("ALTER TABLE lead_activities DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON lead_activities FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_lead_activities_business_line_immutable ON lead_activities"
    )
    op.drop_index(op.f("ix_lead_activities_follow_up_at"), table_name="lead_activities")
    op.drop_index(
        op.f("ix_lead_activities_telecaller_staff_profile_uuid"), table_name="lead_activities"
    )
    op.drop_index(op.f("ix_lead_activities_lead_uuid"), table_name="lead_activities")
    op.drop_table("lead_activities")
    postgresql.ENUM(name="interest_level").drop(op.get_bind())
    postgresql.ENUM(name="call_disposition").drop(op.get_bind())
