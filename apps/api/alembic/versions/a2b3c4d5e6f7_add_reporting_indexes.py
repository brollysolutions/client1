"""reporting indexes on leads/loan_applications/property_deals

Revision ID: a2b3c4d5e6f7
Revises: 678f7a77e812
Create Date: 2026-07-29 00:00:00.000000

Unblocks the Admin analytics/reporting slice (feature-status.md §3 #2, FR-16):
every report's date-range filter (`services/reporting.py`) hits one of these
time columns, and none of them was indexed before this.

ix_loan_applications_lead_uuid closes a pre-existing gap, not a new need of
this slice: property_deals has had ix_property_deals_lead_uuid since
d6e7f8a9b0c1, but its loans sibling never got the equivalent despite an
identical FK shape. The agents report (`get_agents_report`) is the first
query to actually join loan_applications back to leads via lead_uuid, which
is what surfaces the gap now.

ix_leads_business_line_created_at supports the leads report's common case
(one line, a date range) as a single index scan instead of an index scan on
created_at followed by a business_line filter.

Status columns (leads.status, loan_applications.status,
property_deals.status) are deliberately not indexed here: low cardinality,
and every report counts them with `func.count().filter(...)` over an
already date-narrowed set, so a status-only index would not be selective
enough to be worth the write overhead.

Plain transactional CREATE INDEX (matches e5f6a7b8c9d0's "effectively empty
pre-launch" precedent) rather than CREATE INDEX CONCURRENTLY. If real
production volume exists by the time this deploys, switch to
`op.get_context().autocommit_block()` per .claude/rules/database-postgres.md.

Rollback: downgrade drops all four indexes.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | Sequence[str] | None = "678f7a77e812"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (index name, table, columns)
_INDEXES = [
    ("ix_leads_created_at", "leads", ["created_at"]),
    ("ix_leads_business_line_created_at", "leads", ["business_line", "created_at"]),
    ("ix_loan_applications_opened_at", "loan_applications", ["opened_at"]),
    ("ix_loan_applications_lead_uuid", "loan_applications", ["lead_uuid"]),
    ("ix_property_deals_opened_at", "property_deals", ["opened_at"]),
]


def upgrade() -> None:
    for name, table, columns in _INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _columns in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
