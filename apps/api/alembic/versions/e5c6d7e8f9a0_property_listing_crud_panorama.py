"""narrow listing authority, add withdrawal and panorama media

Revision ID: e5c6d7e8f9a0
Revises: e4b5c6d7e8f9
Create Date: 2026-08-20 16:25:00.000000

Clients lose property-submission intake/private-media access. Real-estate
Agents, Sub Admins, and platform Admins may author; owner reads stay isolated
and platform Admin retains the shared queue. Property MP4 intake is removed and
the media constraints admit one JPEG/WebP panorama instead. The migration stops
if legacy video rows exist so operators must archive them explicitly.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5c6d7e8f9a0"
down_revision: str | Sequence[str] | None = "e4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.role', true) = 'admin'
    AND current_setting('app.platform_scope', true) = 'true'
"""
_OWNER = "submitter_uuid::text = current_setting('app.auth_user_uuid', true)"
_RE_AGENT = """
    current_setting('app.role', true) = 'agent'
    AND current_setting('app.business_line', true) IN ('real_estate', 'both')
"""
_AUTHOR = f"({_RE_AGENT}) OR current_setting('app.role', true) = 'sub_admin' OR ({_ADMIN})"
_OLD_SUBMITTER = """
    (
        current_setting('app.role', true) IN ('client', 'agent')
        AND current_setting('app.business_line', true) IN ('real_estate', 'both')
    )
    OR current_setting('app.role', true) = 'sub_admin'
"""
_OLD_PLATFORM_SUB_ADMIN = """
    current_setting('app.role', true) = 'sub_admin'
    AND current_setting('app.platform_scope', true) = 'true'
"""


def _create_author_policies() -> None:
    op.execute("DROP POLICY IF EXISTS property_submissions_select ON property_submissions")
    op.execute("DROP POLICY IF EXISTS property_submissions_insert ON property_submissions")
    op.execute(
        f"""
        CREATE POLICY property_submissions_select ON property_submissions
        FOR SELECT USING (
            ({_ADMIN}) OR (({_OWNER}) AND (({_RE_AGENT}) OR
            current_setting('app.role', true) = 'sub_admin'))
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY property_submissions_insert ON property_submissions
        FOR INSERT WITH CHECK (
            ({_AUTHOR})
            AND ({_OWNER})
            AND business_line::text = 'real_estate'
            AND status::text = 'pending'
        )
        """
    )

    op.execute(
        "DROP POLICY IF EXISTS property_submission_media_select ON property_submission_media"
    )
    op.execute(
        "DROP POLICY IF EXISTS property_submission_media_insert ON property_submission_media"
    )
    op.execute(
        f"""
        CREATE POLICY property_submission_media_select ON property_submission_media
        FOR SELECT USING (
            ({_ADMIN}) OR EXISTS (
                SELECT 1 FROM property_submissions submission
                WHERE submission.id = property_submission_media.submission_uuid
                  AND submission.submitter_uuid::text =
                      current_setting('app.auth_user_uuid', true)
                  AND (({_RE_AGENT}) OR current_setting('app.role', true) = 'sub_admin')
            )
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY property_submission_media_insert ON property_submission_media
        FOR INSERT WITH CHECK (
            ({_AUTHOR})
            AND business_line::text = 'real_estate'
            AND kind::text IN ('image', 'document', 'panorama')
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
        )
        """
    )


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM property_submission_media WHERE kind = 'video')
               OR EXISTS (SELECT 1 FROM property_media WHERE kind = 'video') THEN
                RAISE EXCEPTION 'Archive legacy property video rows before this migration';
            END IF;
        END $$
        """
    )
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE re_submission_status ADD VALUE IF NOT EXISTS 'withdrawn'")

    op.drop_constraint("property_submission_media_kind", "property_submission_media", type_="check")
    op.drop_constraint(
        "property_submission_media_kind_content_type",
        "property_submission_media",
        type_="check",
    )
    op.create_check_constraint(
        "property_submission_media_kind",
        "property_submission_media",
        "kind IN ('image', 'document', 'panorama')",
    )
    op.create_check_constraint(
        "property_submission_media_kind_content_type",
        "property_submission_media",
        "(kind = 'image' AND content_type IN ('image/jpeg','image/png','image/webp')) "
        "OR (kind = 'document' AND content_type = 'application/pdf') "
        "OR (kind = 'panorama' AND content_type IN ('image/jpeg','image/webp'))",
    )
    op.drop_constraint("property_submission_media_size", "property_submission_media", type_="check")
    op.create_check_constraint(
        "property_submission_media_size",
        "property_submission_media",
        "(kind IN ('image','document','panorama') AND size_bytes BETWEEN 1 AND 5242880)",
    )
    op.create_index(
        "uq_property_submission_media_one_panorama",
        "property_submission_media",
        ["submission_uuid"],
        unique=True,
        postgresql_where=sa.text("kind = 'panorama'"),
    )

    op.drop_constraint("property_media_kind_content_type", "property_media", type_="check")
    op.create_check_constraint(
        "property_media_kind_content_type",
        "property_media",
        "(kind = 'image' AND content_type IN ('image/jpeg','image/png','image/webp')) "
        "OR (kind = 'panorama' AND content_type IN ('image/jpeg','image/webp'))",
    )
    op.drop_constraint("property_media_size", "property_media", type_="check")
    op.create_check_constraint(
        "property_media_size",
        "property_media",
        "(kind IN ('image','panorama') AND size_bytes BETWEEN 1 AND 5242880)",
    )
    op.create_index(
        "uq_property_media_one_panorama",
        "property_media",
        ["property_uuid"],
        unique=True,
        postgresql_where=sa.text("kind = 'panorama'"),
    )

    _create_author_policies()


def downgrade() -> None:
    # The predecessor cannot represent panoramas. Enum labels cannot be safely
    # removed in place, so withdrawn rows are normalized while the unused label
    # remains available for a later re-upgrade.
    op.execute("UPDATE property_submissions SET status = 'rejected' WHERE status = 'withdrawn'")
    op.execute("DELETE FROM property_media WHERE kind = 'panorama'")
    op.execute("DELETE FROM property_submission_media WHERE kind = 'panorama'")

    op.drop_index("uq_property_media_one_panorama", table_name="property_media")
    op.drop_constraint("property_media_size", "property_media", type_="check")
    op.create_check_constraint(
        "property_media_size",
        "property_media",
        "(kind = 'image' AND size_bytes BETWEEN 1 AND 5242880) "
        "OR (kind = 'video' AND size_bytes BETWEEN 1 AND 20971520)",
    )
    op.drop_constraint("property_media_kind_content_type", "property_media", type_="check")
    op.create_check_constraint(
        "property_media_kind_content_type",
        "property_media",
        "(kind = 'image' AND content_type IN ('image/jpeg','image/png','image/webp')) "
        "OR (kind = 'video' AND content_type = 'video/mp4')",
    )

    op.drop_index(
        "uq_property_submission_media_one_panorama",
        table_name="property_submission_media",
    )
    op.drop_constraint("property_submission_media_size", "property_submission_media", type_="check")
    op.create_check_constraint(
        "property_submission_media_size",
        "property_submission_media",
        "(kind IN ('image','document') AND size_bytes BETWEEN 1 AND 5242880) "
        "OR (kind = 'video' AND size_bytes BETWEEN 1 AND 20971520)",
    )
    op.drop_constraint(
        "property_submission_media_kind_content_type",
        "property_submission_media",
        type_="check",
    )
    op.drop_constraint("property_submission_media_kind", "property_submission_media", type_="check")
    op.create_check_constraint(
        "property_submission_media_kind",
        "property_submission_media",
        "kind IN ('image', 'document', 'video')",
    )
    op.create_check_constraint(
        "property_submission_media_kind_content_type",
        "property_submission_media",
        "(kind = 'image' AND content_type IN ('image/jpeg','image/png','image/webp')) "
        "OR (kind = 'document' AND content_type = 'application/pdf') "
        "OR (kind = 'video' AND content_type = 'video/mp4')",
    )

    op.execute("DROP POLICY IF EXISTS property_submissions_select ON property_submissions")
    op.execute("DROP POLICY IF EXISTS property_submissions_insert ON property_submissions")
    op.execute(
        f"""
        CREATE POLICY property_submissions_select ON property_submissions
        FOR SELECT USING (
            ({_ADMIN}) OR ({_OWNER}) OR ({_OLD_PLATFORM_SUB_ADMIN}) OR (
                current_setting('app.role', true) = 'sub_admin'
                AND business_line::text = current_setting('app.business_line', true)
            )
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY property_submissions_insert ON property_submissions
        FOR INSERT WITH CHECK (
            ({_OLD_SUBMITTER}) AND ({_OWNER})
            AND business_line::text = 'real_estate'
            AND status::text = 'pending'
        )
        """
    )

    op.execute(
        "DROP POLICY IF EXISTS property_submission_media_select ON property_submission_media"
    )
    op.execute(
        "DROP POLICY IF EXISTS property_submission_media_insert ON property_submission_media"
    )
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
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY property_submission_media_insert ON property_submission_media
        FOR INSERT WITH CHECK (
            ({_OLD_SUBMITTER})
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
        )
        """
    )
