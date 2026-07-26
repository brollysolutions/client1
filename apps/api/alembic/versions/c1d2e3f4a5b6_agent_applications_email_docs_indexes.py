"""agent_applications: email, aadhaar_back_ref, queue index, dedupe index

Revision ID: c1d2e3f4a5b6
Revises: b1c2d3e4f5a6
Create Date: 2026-07-26 00:00:00.000000

Supports the public agent-application intake endpoint (feature-status §5.1). No
enum, RLS-policy, or role DDL here, so the ADR-0004 direct-to-5432 +
rolling-restart procedure is NOT required — plain column/index DDL only.

- `email` (nullable): the public submit path now collects a real email (API
  layer requires it there via a non-optional field), but existing rows —
  including everything scripts/seed_agent_applications.py has ever inserted —
  have none, and this migration must not fail on them. NOT NULL is not added.
- `aadhaar_back_ref` (nullable): the apply form has always captured Aadhaar
  front + back, but the table only had one ref column. `aadhaar_ref` keeps its
  existing meaning (front); this adds the missing back-side column rather than
  renaming `aadhaar_ref` — a rename would need an expand/contract release pair
  for zero functional gain. `address_proof_ref` is left as-is: unused since
  product dropped that document (2026-07-12), not dropped here either (same
  discipline — do not drop a column in the same release a consumer might still
  reference).
- `ix_agent_applications_status_created_at`: backs the Admin pending-queue
  query (`WHERE status = 'pending' ORDER BY created_at DESC`,
  api/v1/admin.py::list_pending_agent_applications) and the orphan-purge job's
  reference scan.
- `uq_agent_applications_mobile_line_pending`: partial unique on
  (mobile, business_line) WHERE status = 'pending' AND mobile IS NOT NULL.
  Backs an ON CONFLICT upsert so a re-apply on the same line refreshes the
  pending row instead of creating a duplicate. business_line is part of the
  conflict key (not the SET clause) so a re-apply on the *other* line is a
  separate row and the business_line-immutability trigger
  (trg_agent_applications_business_line_immutable, e5f6a7b8c9d0) is never
  triggered by this upsert. Approved/rejected rows fall outside the partial
  index, so a rejected applicant can re-apply.

Deliberately NOT changed here: RLS policy on agent_applications, and grants.
The table is `ENABLE` (not `FORCE`) row level security and the API connects as
the `app` superuser; RLS only engages once a request has run
`SET LOCAL ROLE api_user` (core/deps.py::get_current_user). A public,
unauthenticated route never enters that dependency, so an anonymous INSERT
policy branch would be dead code — and since `agent_applications_rls` is
`FOR ALL` with an identical USING/WITH CHECK predicate, any branch permitting
an anonymous INSERT would equally permit an anonymous SELECT, leaking KYC
refs. The public write goes through the same superuser-bypass session as
services/leads.py::capture_lead. Table-level grants already cover new columns
(api_user has SELECT/INSERT/UPDATE/DELETE from f2e4d6c8a0b1), so no GRANT here.

Plain (non-CONCURRENTLY) CREATE INDEX is fine pre-launch (table is empty),
same reasoning as e5f6a7b8c9d0. On a populated production table, both indexes
below must be created CONCURRENTLY outside a transaction.

Rollback notes: dropping the two indexes is always safe. Dropping `email` /
`aadhaar_back_ref` loses any data written after this upgrade — acceptable only
as an emergency rollback before real applicant traffic exists.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Pre-flight guard: a pre-existing duplicate (mobile, business_line) among
    # pending rows would make the unique-index creation below fail with an
    # opaque "could not create unique index" error. Fail loudly instead, with
    # the offending pairs, so whoever runs this migration knows what to fix.
    conn = op.get_bind()
    dupes = conn.execute(
        sa.text(
            """
            SELECT mobile, business_line, count(*) AS n
              FROM agent_applications
             WHERE status = 'pending' AND mobile IS NOT NULL
             GROUP BY mobile, business_line
            HAVING count(*) > 1
            """
        )
    ).fetchall()
    if dupes:
        raise RuntimeError(
            "agent_applications has duplicate pending (mobile, business_line) "
            f"pairs, cannot create uq_agent_applications_mobile_line_pending: "
            f"{[(row.mobile, row.business_line, row.n) for row in dupes]}"
        )

    op.add_column("agent_applications", sa.Column("email", sa.String(), nullable=True))
    op.add_column("agent_applications", sa.Column("aadhaar_back_ref", sa.String(), nullable=True))

    op.create_index(
        "ix_agent_applications_status_created_at",
        "agent_applications",
        ["status", sa.text("created_at DESC")],
    )
    op.create_index(
        "uq_agent_applications_mobile_line_pending",
        "agent_applications",
        ["mobile", "business_line"],
        unique=True,
        postgresql_where=sa.text("status = 'pending' AND mobile IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_agent_applications_mobile_line_pending", table_name="agent_applications")
    op.drop_index("ix_agent_applications_status_created_at", table_name="agent_applications")
    op.drop_column("agent_applications", "aadhaar_back_ref")
    op.drop_column("agent_applications", "email")
