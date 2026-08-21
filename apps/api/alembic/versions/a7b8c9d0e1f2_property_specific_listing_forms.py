"""add property-specific details and Admin-controlled RERA review

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-21

The existing ``details`` JSONB columns are retained for historical rows but new
intake writes the closed ``structured_details`` payload with a schema version.
RERA numbers become optional; applicant applicability and reviewer-controlled
verification are deliberately separate.  No RLS predicate changes: ownership,
authoring roles, Admin review, and public active-row boundaries are unchanged.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_APPLICABILITY = ("applicable", "exemption_claimed", "unsure")
_VERIFICATION = ("not_reviewed", "verified", "mismatch", "exemption_verified")


def _add_columns(table: str, *, include_review_note: bool) -> None:
    applicability = postgresql.ENUM(
        *_APPLICABILITY, name="re_rera_applicability", create_type=False
    )
    verification = postgresql.ENUM(
        *_VERIFICATION, name="re_rera_verification_status", create_type=False
    )
    op.add_column(table, sa.Column("state", sa.String(length=120), nullable=True))
    op.add_column(table, sa.Column("details_version", sa.SmallInteger(), nullable=True))
    op.add_column(table, sa.Column("structured_details", postgresql.JSONB(), nullable=True))
    op.add_column(
        table,
        sa.Column(
            "rera_applicability",
            applicability,
            nullable=False,
            server_default="unsure",
        ),
    )
    op.add_column(
        table,
        sa.Column(
            "rera_verification_status",
            verification,
            nullable=False,
            server_default="not_reviewed",
        ),
    )
    op.add_column(table, sa.Column("rera_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        table,
        sa.Column("rera_verified_by_uuid", postgresql.UUID(as_uuid=True), nullable=True),
    )
    if include_review_note:
        op.add_column(table, sa.Column("rera_review_note", sa.Text(), nullable=True))
    op.create_foreign_key(
        f"fk_{table}_rera_verified_by_uuid_auth_users",
        table,
        "auth_users",
        ["rera_verified_by_uuid"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        f"ck_{table}_rera_review_metadata",
        table,
        "(rera_verification_status = 'not_reviewed' AND rera_verified_at IS NULL "
        "AND rera_verified_by_uuid IS NULL) OR "
        "(rera_verification_status <> 'not_reviewed' AND rera_verified_at IS NOT NULL)",
    )
    op.create_check_constraint(
        f"ck_{table}_rera_verified_applicable",
        table,
        "rera_verification_status <> 'verified' OR "
        "(rera_applicability = 'applicable' AND NULLIF(BTRIM(rera_number), '') IS NOT NULL)",
    )
    op.create_check_constraint(
        f"ck_{table}_rera_exemption_review",
        table,
        "rera_verification_status <> 'exemption_verified' OR "
        "rera_applicability = 'exemption_claimed'",
    )


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM(*_APPLICABILITY, name="re_rera_applicability").create(bind)
    postgresql.ENUM(*_VERIFICATION, name="re_rera_verification_status").create(bind)

    _add_columns("property_submissions", include_review_note=True)
    _add_columns("properties", include_review_note=False)

    for table in ("property_submissions", "properties"):
        op.alter_column(table, "rera_number", existing_type=sa.String(length=40), nullable=True)
        op.execute(
            sa.text(
                f"""
                UPDATE {table}
                SET rera_applicability = CASE
                    WHEN NULLIF(BTRIM(rera_number), '') IS NULL THEN 'unsure'::re_rera_applicability
                    ELSE 'applicable'::re_rera_applicability
                END,
                    rera_number = NULLIF(BTRIM(rera_number), '')
                """
            )
        )
        op.alter_column(
            table,
            "furnishing",
            existing_type=postgresql.ENUM(name="re_furnishing", create_type=False),
            nullable=True,
        )
        op.alter_column(
            table,
            "construction_status",
            existing_type=postgresql.ENUM(name="re_construction_status", create_type=False),
            nullable=True,
        )


def downgrade() -> None:
    for table in ("properties", "property_submissions"):
        op.execute(
            sa.text(
                f"""
                UPDATE {table}
                SET rera_number = COALESCE(rera_number, ''),
                    furnishing = COALESCE(furnishing, 'unfurnished'::re_furnishing),
                    construction_status = COALESCE(
                        construction_status, 'ready'::re_construction_status
                    )
                """
            )
        )
        op.alter_column(
            table,
            "construction_status",
            existing_type=postgresql.ENUM(name="re_construction_status", create_type=False),
            nullable=False,
        )
        op.alter_column(
            table,
            "furnishing",
            existing_type=postgresql.ENUM(name="re_furnishing", create_type=False),
            nullable=False,
        )
        op.alter_column(table, "rera_number", existing_type=sa.String(length=40), nullable=False)

        op.drop_constraint(f"ck_{table}_rera_exemption_review", table_name=table, type_="check")
        op.drop_constraint(f"ck_{table}_rera_verified_applicable", table_name=table, type_="check")
        op.drop_constraint(f"ck_{table}_rera_review_metadata", table_name=table, type_="check")
        op.drop_constraint(
            f"fk_{table}_rera_verified_by_uuid_auth_users", table_name=table, type_="foreignkey"
        )
        if table == "property_submissions":
            op.drop_column(table, "rera_review_note")
        op.drop_column(table, "rera_verified_by_uuid")
        op.drop_column(table, "rera_verified_at")
        op.drop_column(table, "rera_verification_status")
        op.drop_column(table, "rera_applicability")
        op.drop_column(table, "structured_details")
        op.drop_column(table, "details_version")
        op.drop_column(table, "state")

    bind = op.get_bind()
    postgresql.ENUM(name="re_rera_verification_status").drop(bind)
    postgresql.ENUM(name="re_rera_applicability").drop(bind)
