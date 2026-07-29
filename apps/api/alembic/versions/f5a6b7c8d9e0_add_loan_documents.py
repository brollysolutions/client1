"""add loan_documents table + RLS (client KYC upload)

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-07-29 11:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (GRANT + RLS
policy require a direct connection — ADR-0004).

`loan_documents` is the client-uploaded KYC-document counterpart to
`task_documents` (employee-collected). The `/dashboard/apply` page's KYC
tiles have validated/previewed files client-side since that slice shipped
but never transmitted them (`TODO(loan-kyc-upload)`); this table plus the
signed-POST upload flow in `services/loan_documents.py` closes that gap. See
docs/specs/client-kyc-upload.md.

`client_profile_uuid` is DENORMALIZED from the parent `loan_applications`
row on purpose (not just derivable via a join): this table is read on every
`/dashboard/documents` page load, and a flat equality predicate is much
cheaper than an EXISTS join for that hot path — the same reasoning
`commissions`/`fee_cashbacks` denormalize their own recipient identity
columns rather than joining through a deal/loan-application row every read.

`verified` / `verified_by_profile_uuid` / `verified_at` / `review_note`
are created NOW, written by nobody until the FR-7.4 Admin document-
verification slice — mirroring `task_documents`'s own precedent
(b3c4d5e6f7a8's docstring: "written by a later Admin-side slice, never by
the collecting employee... kept here so that slice extends this table
rather than re-migrating it"). The column-scoped `GRANT UPDATE` and the
admin-only `loan_documents_update` policy below are shipped in THIS
migration for the same forward-compatibility reason — see
docs/ai/plans/plan-1-2-and-3-hidden-willow.md §"Does slice 3 force changes
to slice 2's table design?" for the four-point rationale. Deliberately no
`updated_at` column: a column-scoped GRANT + an `onupdate`-stamped timestamp
is a known trap (875b08101bea) — Postgres checks privileges against the
full emitted SET clause, not just the columns passed to `.values()`, so an
`onupdate` timestamp not covered by the same grant 500s every write. `task_
documents` already has no `updated_at` for the identical reason; `verified_at`
is the timestamp that actually matters here and it is set explicitly.

RLS: FOUR per-command policies, not one FOR ALL — reading and writing are
different rights (the `audit_log`/`commissions`/`fee_cashbacks` posture).

  * `loan_documents_select` mirrors `loan_applications_rls` itself
    (2b3c4d5e6f7a) byte-for-byte in shape: admin platform-scope bypass,
    the owning client's `client_profile_uuid`, or a staff member
    (telecaller/employee/sub_admin) on the matching `business_line`.
    Anyone who can already see the application is not surprised by seeing
    its documents — same trust boundary, no narrower.
  * `loan_documents_insert` / `loan_documents_delete` — client-only, and
    ONLY the owning client (identity check, not just line). Admin
    deliberately CANNOT insert or delete: Admin verifies, never uploads
    (FR-7.4); the employee's own upload path is `task_documents`, untouched
    by this table.
  * `loan_documents_update` — admin-only (platform_scope AND role), for the
    slice-3 verification columns. No client UPDATE branch at all: uploading
    is one-shot (upload once, delete-and-reupload to replace), so a client
    never legitimately needs to UPDATE their own row.

The DELETE policy carries NO `AND verified = false` clause, even though a
DB-level "clients can't delete a verified document" guard is tempting: a
`verified = false` clause would make a verified document undeletable at
account-deletion time, since `services/account_deletion.py` Phase A runs on
the CALLER's client session — pushing the KYC-PII scrub into Phase B, which
is explicitly best-effort and never re-raised. Trading a durable, atomic
PII-deletion obligation (SRS 5.1) for a convenience guard is the wrong way
round. The "verified documents are undeletable via the ordinary API" rule
instead lives in `services/loan_documents.py::delete_loan_document`
(`DocumentAlreadyVerified` -> 409); the account-deletion scrub bypasses that
service function entirely and deletes rows unconditionally, exactly the
posture Phase A already takes for `agent_applications` doc refs.

Rollback: drop policies, disable RLS, revoke grants, drop trigger, drop
indexes + table. No enum to drop (doc_type/content_type are free TEXT, per
the task_documents/ERD convention — the vocabulary is an API-layer Literal).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: str | Sequence[str] | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FN = "enforce_business_line_immutable"

# Byte-for-byte the loan_applications_rls shape (2b3c4d5e6f7a), extended with
# an admin platform-scope bypass in the same form every post-a0b1c2d3e4f5
# table uses.
_SELECT_PREDICATE = """
    (current_setting('app.platform_scope', true) = 'true'
     AND current_setting('app.role', true) = 'admin')
    OR client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
    )
"""

_CLIENT_OWNER_PREDICATE = """
    client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    AND current_setting('app.role', true) = 'client'
"""

_ADMIN_ONLY_PREDICATE = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""


def upgrade() -> None:
    op.create_table(
        "loan_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("loan_application_uuid", sa.UUID(), nullable=False),
        sa.Column("client_profile_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("doc_type", sa.Text(), nullable=False),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("uploaded_by_uuid", sa.UUID(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified_by_profile_uuid", sa.UUID(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["loan_application_uuid"],
            ["loan_applications.id"],
            name=op.f("fk_loan_documents_loan_application_uuid_loan_applications"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["client_profile_uuid"],
            ["client_profiles.id"],
            name=op.f("fk_loan_documents_client_profile_uuid_client_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_uuid"],
            ["auth_users.id"],
            name=op.f("fk_loan_documents_uploaded_by_uuid_auth_users"),
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_profile_uuid"],
            ["staff_profiles.id"],
            name=op.f("fk_loan_documents_verified_by_profile_uuid_staff_profiles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_loan_documents")),
    )

    op.create_index("uq_loan_documents_object_key", "loan_documents", ["object_key"], unique=True)
    op.create_index(
        "ix_loan_documents_loan_application_uuid", "loan_documents", ["loan_application_uuid"]
    )
    op.create_index(
        "ix_loan_documents_unverified",
        "loan_documents",
        ["loan_application_uuid"],
        postgresql_where=sa.text("verified = false"),
    )

    op.execute(
        f"CREATE TRIGGER trg_loan_documents_business_line_immutable "
        f"BEFORE UPDATE ON loan_documents "
        f"FOR EACH ROW EXECUTE FUNCTION {_FN}()"
    )

    op.execute("GRANT SELECT, INSERT, DELETE ON loan_documents TO api_user")
    op.execute(
        "GRANT UPDATE (verified, verified_by_profile_uuid, verified_at, review_note) "
        "ON loan_documents TO api_user"
    )
    op.execute("ALTER TABLE loan_documents ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY loan_documents_select ON loan_documents
        FOR SELECT
        USING ({_SELECT_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY loan_documents_insert ON loan_documents
        FOR INSERT
        WITH CHECK ({_CLIENT_OWNER_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY loan_documents_delete ON loan_documents
        FOR DELETE
        USING ({_CLIENT_OWNER_PREDICATE});
        """
    )
    op.execute(
        f"""
        CREATE POLICY loan_documents_update ON loan_documents
        FOR UPDATE
        USING ({_ADMIN_ONLY_PREDICATE})
        WITH CHECK ({_ADMIN_ONLY_PREDICATE});
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS loan_documents_update ON loan_documents")
    op.execute("DROP POLICY IF EXISTS loan_documents_delete ON loan_documents")
    op.execute("DROP POLICY IF EXISTS loan_documents_insert ON loan_documents")
    op.execute("DROP POLICY IF EXISTS loan_documents_select ON loan_documents")
    op.execute("ALTER TABLE loan_documents DISABLE ROW LEVEL SECURITY")
    op.execute(
        "REVOKE UPDATE (verified, verified_by_profile_uuid, verified_at, review_note) "
        "ON loan_documents FROM api_user"
    )
    op.execute("REVOKE SELECT, INSERT, DELETE ON loan_documents FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_loan_documents_business_line_immutable ON loan_documents"
    )
    op.drop_index("ix_loan_documents_unverified", table_name="loan_documents")
    op.drop_index("ix_loan_documents_loan_application_uuid", table_name="loan_documents")
    op.drop_index("uq_loan_documents_object_key", table_name="loan_documents")
    op.drop_table("loan_documents")
