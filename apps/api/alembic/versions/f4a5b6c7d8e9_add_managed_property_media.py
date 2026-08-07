"""add managed private submission media and approved public property media

Revision ID: f4a5b6c7d8e9
Revises: e2f3a4b5c6d7
Create Date: 2026-08-07 00:00:00.000000

Pending submission assets live under a private storage prefix and are owner or
platform-Admin readable. Approved catalogue images are copied to a separate
public prefix and represented by property_media rows. This migration also
aligns FR-7.3 authorization: Client/Lead, Agent, and Sub Admin may submit, while
only platform Admin can read the shared review queue and approve/reject.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: str | Sequence[str] | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.role', true) = 'admin'
    AND current_setting('app.platform_scope', true) = 'true'
"""
_OWNER = "submitter_uuid::text = current_setting('app.auth_user_uuid', true)"
_SUBMITTER_SCOPE = """
    (
        current_setting('app.role', true) IN ('client', 'agent')
        AND current_setting('app.business_line', true) IN ('real_estate', 'both')
    )
    OR current_setting('app.role', true) = 'sub_admin'
"""


def upgrade() -> None:
    op.create_table(
        "property_submission_media",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("submission_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("content_type", sa.String(length=80), nullable=False),
        sa.Column("object_key", sa.String(length=600), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("kind IN ('image', 'document')", name="property_submission_media_kind"),
        sa.CheckConstraint(
            "(kind = 'image' AND content_type IN ('image/jpeg', 'image/png', 'image/webp')) "
            "OR (kind = 'document' AND content_type = 'application/pdf')",
            name="property_submission_media_kind_content_type",
        ),
        sa.CheckConstraint(
            "size_bytes BETWEEN 1 AND 5242880", name="property_submission_media_size"
        ),
        sa.CheckConstraint("position BETWEEN 0 AND 11", name="property_submission_media_position"),
        sa.CheckConstraint(
            "business_line::text = 'real_estate'",
            name="property_submission_media_real_estate",
        ),
        sa.ForeignKeyConstraint(
            ["submission_uuid"],
            ["property_submissions.id"],
            name="fk_property_submission_media_submission",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_property_submission_media"),
        sa.UniqueConstraint("object_key", name="uq_property_submission_media_object_key"),
        sa.UniqueConstraint(
            "submission_uuid",
            "position",
            name="uq_property_submission_media_submission_position",
        ),
    )
    op.create_index(
        "ix_property_submission_media_submission_uuid",
        "property_submission_media",
        ["submission_uuid"],
    )

    op.create_table(
        "property_media",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("property_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "business_line",
            postgresql.ENUM(
                "loans", "real_estate", "both", name="business_line_enum", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("content_type", sa.String(length=80), nullable=False),
        sa.Column("object_key", sa.String(length=600), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp')",
            name="property_media_content_type",
        ),
        sa.CheckConstraint("size_bytes BETWEEN 1 AND 5242880", name="property_media_size"),
        sa.CheckConstraint("position BETWEEN 0 AND 9", name="property_media_position"),
        sa.CheckConstraint(
            "business_line::text = 'real_estate'", name="property_media_real_estate"
        ),
        sa.ForeignKeyConstraint(
            ["property_uuid"],
            ["properties.id"],
            name="fk_property_media_property_uuid_properties",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_property_media"),
        sa.UniqueConstraint("object_key", name="uq_property_media_object_key"),
        sa.UniqueConstraint(
            "property_uuid", "position", name="uq_property_media_property_position"
        ),
    )
    op.create_index("ix_property_media_property_uuid", "property_media", ["property_uuid"])

    op.execute(
        "CREATE TRIGGER trg_property_submission_media_business_line_immutable "
        "BEFORE UPDATE ON property_submission_media FOR EACH ROW "
        "EXECUTE FUNCTION enforce_business_line_immutable()"
    )
    op.execute(
        "CREATE TRIGGER trg_property_media_business_line_immutable "
        "BEFORE UPDATE ON property_media FOR EACH ROW "
        "EXECUTE FUNCTION enforce_business_line_immutable()"
    )

    op.execute("DROP POLICY property_submissions_select ON property_submissions")
    op.execute("DROP POLICY property_submissions_insert ON property_submissions")
    op.execute(
        f"""
        CREATE POLICY property_submissions_select ON property_submissions
        FOR SELECT USING (({_ADMIN}) OR ({_OWNER}));
        """
    )
    op.execute(
        f"""
        CREATE POLICY property_submissions_insert ON property_submissions
        FOR INSERT WITH CHECK (
            ({_SUBMITTER_SCOPE})
            AND ({_OWNER})
            AND business_line::text = 'real_estate'
            AND status::text = 'pending'
        );
        """
    )

    op.execute("GRANT SELECT, INSERT ON property_submission_media TO api_user")
    op.execute("ALTER TABLE property_submission_media ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY property_submission_media_select ON property_submission_media
        FOR SELECT USING (
            ({_ADMIN}) OR EXISTS (
                SELECT 1 FROM property_submissions submission
                WHERE submission.id = property_submission_media.submission_uuid
                  AND submission.submitter_uuid::text =
                      current_setting('app.auth_user_uuid', true)
            )
        );
        """
    )
    op.execute(
        f"""
        CREATE POLICY property_submission_media_insert ON property_submission_media
        FOR INSERT WITH CHECK (
            ({_SUBMITTER_SCOPE})
            AND business_line::text = 'real_estate'
            AND object_key LIKE (
                'private/property-submissions/canonical/' ||
                current_setting('app.auth_user_uuid', true) || '/%'
            )
            AND EXISTS (
                SELECT 1 FROM property_submissions submission
                WHERE submission.id = property_submission_media.submission_uuid
                  AND submission.submitter_uuid::text =
                      current_setting('app.auth_user_uuid', true)
                  AND submission.status::text = 'pending'
            )
        );
        """
    )

    op.execute("GRANT SELECT ON property_media TO api_user")
    op.execute("ALTER TABLE property_media ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY property_media_select ON property_media
        FOR SELECT USING (
            ({_ADMIN}) OR EXISTS (
                SELECT 1 FROM properties property
                WHERE property.id = property_media.property_uuid
                  AND property.active = true
            )
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS property_media_select ON property_media")
    op.execute("ALTER TABLE property_media DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT ON property_media FROM api_user")
    op.execute(
        "DROP POLICY IF EXISTS property_submission_media_insert ON property_submission_media"
    )
    op.execute(
        "DROP POLICY IF EXISTS property_submission_media_select ON property_submission_media"
    )
    op.execute("ALTER TABLE property_submission_media DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT ON property_submission_media FROM api_user")

    op.execute("DROP POLICY property_submissions_insert ON property_submissions")
    op.execute("DROP POLICY property_submissions_select ON property_submissions")
    op.execute(
        """
        CREATE POLICY property_submissions_select ON property_submissions
        FOR SELECT USING (
            (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'admin'
            )
            OR submitter_uuid::text = current_setting('app.auth_user_uuid', true)
            OR (
                current_setting('app.role', true) = 'sub_admin'
                AND business_line::text = current_setting('app.business_line', true)
            )
            OR (
                current_setting('app.platform_scope', true) = 'true'
                AND current_setting('app.role', true) = 'sub_admin'
            )
        );
        """
    )
    op.execute(
        """
        CREATE POLICY property_submissions_insert ON property_submissions
        FOR INSERT WITH CHECK (
            submitter_uuid::text = current_setting('app.auth_user_uuid', true)
            AND business_line::text = 'real_estate'
            AND status::text = 'pending'
        );
        """
    )

    op.execute(
        "DROP TRIGGER IF EXISTS trg_property_media_business_line_immutable ON property_media"
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trg_property_submission_media_business_line_immutable "
        "ON property_submission_media"
    )
    op.drop_index("ix_property_media_property_uuid", table_name="property_media")
    op.drop_table("property_media")
    op.drop_index(
        "ix_property_submission_media_submission_uuid",
        table_name="property_submission_media",
    )
    op.drop_table("property_submission_media")
