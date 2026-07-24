"""add property_deals table + enum + RLS

Revision ID: d6e7f8a9b0c1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-23 21:10:00.000000

Retargeted post-merge: originally forked from the shared ancestor b3c4d5e6f7a8
alongside PR #93's loan-lifecycle migrations (c4d5e6f7a8b9, d5e6f7a8b9c0),
since both PRs were open in parallel off the same main tip. #93 merged first;
this migration is rebased onto its head (d5e6f7a8b9c0) here to keep the chain
linear rather than adding an empty Alembic merge-migration for two siblings
that don't touch overlapping schema.

NOTE: Run directly against postgres:5432, NOT through pgBouncer (enum DDL +
GRANT + RLS policy require a direct connection — ADR-0004 / see f2e4d6c8a0b1).

property_deals is the real-estate-line analogue of loan_applications: a
staff-driven, trackable purchase pipeline record, distinct from the existing
client-initiated request forms enquiries/site_visits (which stay untouched —
this is a NEW entity, not a retrofit of either). Ships table + progression
grants + narrowed RLS together in one migration (unlike loan_applications,
which staged SELECT-only then a later grant+narrowing migration) because,
unlike loans, no client-write endpoint precedes this — creation is
telecaller-only from day one, so there is no reason to stage.

client_profile_uuid is a real FK (unlike enquiries/site_visits' identity-level
user_uuid — needed here for the customer_code join in the admin list view),
but the RLS client-visibility branch does NOT copy loan_applications_rls's
direct `client_profile_uuid::text = current_setting('app.client_profile_uuid')`
predicate. That predicate relies on the JWT's single client_profile_uuid claim,
which auth_service._build_access_claims picks alphabetically-first-line
("loans" < "real_estate") — a dual-line client's JWT never carries their
real-estate profile id, so a direct-equality predicate would silently return
zero rows for every dual-line client (the overwhelming majority per
CLAUDE.md). Instead this uses an EXISTS through client_profiles keyed on
app.auth_user_uuid (always present, identity-level, same trick
enquiries/site_visits use) — a hybrid of both existing patterns, not a
straight copy of either.

Telecaller branch is narrowed to assigned-lead-only from day one (mirrors the
leads_rls/loan_applications_rls narrowing, e6c7b8f9a0d1 + PR #93's
d5e6f7a8b9c0 — not shipped broad-then-narrowed like enquiries/site_visits
were). Employee/sub_admin keep whole-line access. USING = WITH CHECK on every
branch (the leads "D1" lesson, d4a1b2c3e5f6: an asymmetric WITH CHECK
silently blocks legitimate writes).

Same accepted trade-off loan_applications documents: this is one FOR ALL
policy, so the employee/sub_admin/telecaller branches technically pass UPDATE
RLS too, not just SELECT — the column-scoped UPDATE grant below (status
fields only, never the identity/FK columns) plus "no employee/sub_admin
write endpoint exists" is the actual mitigation, not a stricter per-command
policy split.

No one-active-deal-per-client uniqueness index (deliberate deviation from
loan_applications' partial-unique index): unlike a loan, a client can
reasonably pursue several properties concurrently.

Rollback: drop policy, disable RLS, revoke grants, drop trigger, drop table
(drops indexes), drop enum.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: str | Sequence[str] | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_VALUES = (
    "new",
    "contacted",
    "site_visit_done",
    "negotiation",
    "booked",
    "agreement_signed",
    "closed",
    "rejected",
    "on_hold",
)

_FN = "enforce_business_line_immutable"

_RLS_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    OR EXISTS (
        SELECT 1 FROM client_profiles cp
        WHERE cp.id = property_deals.client_profile_uuid
          AND cp.auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND EXISTS (
            SELECT 1 FROM leads l
            WHERE l.id = property_deals.lead_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
"""


def upgrade() -> None:
    bind = op.get_bind()

    status_enum = postgresql.ENUM(*_STATUS_VALUES, name="property_deal_status")
    status_enum.create(bind)

    op.create_table(
        "property_deals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lead_uuid", sa.UUID(), nullable=False),
        sa.Column("client_profile_uuid", sa.UUID(), nullable=False),
        sa.Column("property_id", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("site_visit_uuid", sa.UUID(), nullable=True),
        sa.Column("price_quoted", sa.Numeric(14, 2), nullable=True),
        sa.Column("booking_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(*_STATUS_VALUES, name="property_deal_status", create_type=False),
            nullable=False,
            server_default="new",
        ),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["lead_uuid"], ["leads.id"], name=op.f("fk_property_deals_lead_uuid_leads")
        ),
        sa.ForeignKeyConstraint(
            ["client_profile_uuid"],
            ["client_profiles.id"],
            name=op.f("fk_property_deals_client_profile_uuid_client_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["property_id"],
            ["properties.id"],
            name=op.f("fk_property_deals_property_id_properties"),
        ),
        sa.ForeignKeyConstraint(
            ["site_visit_uuid"],
            ["site_visits.id"],
            name=op.f("fk_property_deals_site_visit_uuid_site_visits"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_property_deals")),
    )
    op.create_index(
        op.f("ix_property_deals_client_profile_uuid"),
        "property_deals",
        ["client_profile_uuid"],
    )
    op.create_index(
        op.f("ix_property_deals_lead_uuid"),
        "property_deals",
        ["lead_uuid"],
    )

    op.execute(
        f"CREATE TRIGGER trg_property_deals_business_line_immutable "
        f"BEFORE UPDATE ON property_deals "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT ON property_deals TO api_user")
    op.execute(
        "GRANT UPDATE (status, status_reason, closed_at, site_visit_uuid, "
        "price_quoted, booking_amount) ON property_deals TO api_user"
    )
    op.execute("ALTER TABLE property_deals ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY property_deals_rls ON property_deals
        FOR ALL
        USING ({_RLS_PREDICATE})
        WITH CHECK ({_RLS_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS property_deals_rls ON property_deals")
    op.execute("ALTER TABLE property_deals DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, UPDATE ON property_deals FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_property_deals_business_line_immutable ON property_deals"
    )
    op.drop_table("property_deals")
    postgresql.ENUM(name="property_deal_status").drop(op.get_bind())
