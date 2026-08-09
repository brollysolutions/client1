"""finalize managed media processing, video, feedback, and retention metadata

Revision ID: f0e9d8c7b6a5
Revises: e0f1a2b3c4d6
Create Date: 2026-08-09 12:00:00.000000

All changes are additive for existing image/PDF rows. Existing assets begin in
``ready`` state for compatibility; new request paths stamp ``sanitized_at`` and
new videos remain private and non-projectable until the scheduler replaces the
quarantined upload with a canonical transcoded object.

Task feedback is purpose-bound to real-estate ``property_visit`` tasks. RLS
allows only the assigned Employee and platform Admin to read it; only the
assigned Employee may insert/delete while the task is writable. Client and
Telecaller sessions have no policy branch.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f0e9d8c7b6a5"
down_revision: str | Sequence[str] | None = "e0f1a2b3c4d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADMIN = """
    current_setting('app.platform_scope', true) = 'true'
    AND current_setting('app.role', true) = 'admin'
"""
_ASSIGNED_EMPLOYEE = """
    current_setting('app.role', true) = 'employee'
    AND current_setting('app.staff_profile_uuid', true) <> ''
    AND EXISTS (
        SELECT 1 FROM tasks task
        WHERE task.id = task_feedback_media.task_uuid
          AND task.task_type::text = 'property_visit'
          AND task.business_line::text = 'real_estate'
          AND task.business_line::text = current_setting('app.business_line', true)
          AND task.assigned_employee_profile_uuid::text =
              current_setting('app.staff_profile_uuid', true)
    )
"""
_WRITABLE_ASSIGNED_EMPLOYEE = f"""
    ({_ASSIGNED_EMPLOYEE})
    AND EXISTS (
        SELECT 1 FROM tasks writable_task
        WHERE writable_task.id = task_feedback_media.task_uuid
          AND writable_task.status::text IN ('assigned', 'in_progress', 'blocked')
    )
"""


def _add_processing_columns(table: str) -> None:
    op.add_column(
        table,
        sa.Column(
            "processing_status",
            sa.String(length=20),
            nullable=False,
            server_default="ready",
        ),
    )
    op.add_column(table, sa.Column("processing_error_code", sa.Text(), nullable=True))
    op.add_column(
        table, sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(table, sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(table, sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column(table, sa.Column("sanitized_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        f"{table}_processing_status",
        table,
        "processing_status IN ('pending', 'processing', 'ready', 'failed')",
    )
    op.create_check_constraint(
        f"{table}_duration",
        table,
        "duration_seconds IS NULL OR duration_seconds > 0",
    )
    op.create_check_constraint(
        f"{table}_video_ready",
        table,
        "content_type <> 'video/mp4' OR processing_status <> 'ready' OR "
        "(sanitized_at IS NOT NULL AND duration_seconds IS NOT NULL)",
    )


def upgrade() -> None:
    _add_processing_columns("property_submission_media")
    _add_processing_columns("loan_documents")

    op.drop_constraint(
        "property_submission_media_kind",
        "property_submission_media",
        type_="check",
    )
    op.drop_constraint(
        "property_submission_media_kind_content_type",
        "property_submission_media",
        type_="check",
    )
    op.drop_constraint(
        "property_submission_media_size",
        "property_submission_media",
        type_="check",
    )
    op.drop_constraint(
        "property_submission_media_position",
        "property_submission_media",
        type_="check",
    )
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
    op.create_check_constraint(
        "property_submission_media_size",
        "property_submission_media",
        "(kind IN ('image','document') AND size_bytes BETWEEN 1 AND 5242880) "
        "OR (kind = 'video' AND size_bytes BETWEEN 1 AND 20971520)",
    )
    op.create_check_constraint(
        "property_submission_media_position",
        "property_submission_media",
        "position BETWEEN 0 AND 12",
    )
    op.create_index(
        "ix_property_submission_media_processing",
        "property_submission_media",
        ["processing_status", "created_at"],
        postgresql_where=sa.text("processing_status IN ('pending','processing','failed')"),
    )

    op.add_column(
        "property_media",
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="image"),
    )
    op.add_column("property_media", sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column(
        "property_media", sa.Column("sanitized_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.drop_constraint("property_media_content_type", "property_media", type_="check")
    op.drop_constraint("property_media_size", "property_media", type_="check")
    op.drop_constraint("property_media_position", "property_media", type_="check")
    op.create_check_constraint(
        "property_media_kind_content_type",
        "property_media",
        "(kind = 'image' AND content_type IN ('image/jpeg','image/png','image/webp')) "
        "OR (kind = 'video' AND content_type = 'video/mp4')",
    )
    op.create_check_constraint(
        "property_media_size",
        "property_media",
        "(kind = 'image' AND size_bytes BETWEEN 1 AND 5242880) "
        "OR (kind = 'video' AND size_bytes BETWEEN 1 AND 20971520)",
    )
    op.create_check_constraint(
        "property_media_position", "property_media", "position BETWEEN 0 AND 10"
    )
    op.create_check_constraint(
        "property_media_duration",
        "property_media",
        "duration_seconds IS NULL OR duration_seconds > 0",
    )
    op.create_check_constraint(
        "property_media_video_ready",
        "property_media",
        "kind <> 'video' OR (sanitized_at IS NOT NULL AND duration_seconds IS NOT NULL)",
    )

    op.create_check_constraint(
        "loan_documents_content_type",
        "loan_documents",
        "content_type IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4')",
    )
    op.create_check_constraint(
        "loan_documents_size",
        "loan_documents",
        "(content_type <> 'video/mp4' AND size_bytes BETWEEN 1 AND 5242880) "
        "OR (content_type = 'video/mp4' AND size_bytes BETWEEN 1 AND 20971520)",
    )
    op.create_index(
        "ix_loan_documents_processing",
        "loan_documents",
        ["processing_status", "created_at"],
        postgresql_where=sa.text("processing_status IN ('pending','processing','failed')"),
    )

    op.create_table(
        "task_feedback_media",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("task_uuid", sa.UUID(), nullable=False),
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
        sa.Column("uploaded_by_uuid", sa.UUID(), nullable=False),
        sa.Column("sanitized_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "business_line::text = 'real_estate'", name="task_feedback_media_real_estate"
        ),
        sa.CheckConstraint("kind IN ('image','document')", name="task_feedback_media_kind"),
        sa.CheckConstraint(
            "(kind = 'image' AND content_type IN ('image/jpeg','image/png','image/webp')) "
            "OR (kind = 'document' AND content_type = 'application/pdf')",
            name="task_feedback_media_kind_content_type",
        ),
        sa.CheckConstraint("size_bytes BETWEEN 1 AND 5242880", name="task_feedback_media_size"),
        sa.ForeignKeyConstraint(
            ["task_uuid"], ["tasks.id"], ondelete="CASCADE", name="fk_feedback_media_task"
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_uuid"], ["auth_users.id"], name="fk_feedback_media_uploader"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_task_feedback_media"),
        sa.UniqueConstraint("object_key", name="uq_task_feedback_media_object_key"),
    )
    op.create_index("ix_task_feedback_media_task_uuid", "task_feedback_media", ["task_uuid"])
    op.create_index(
        "ix_task_feedback_media_uploaded_by_uuid",
        "task_feedback_media",
        ["uploaded_by_uuid"],
    )
    op.execute(
        "CREATE TRIGGER trg_task_feedback_media_business_line_immutable "
        "BEFORE UPDATE ON task_feedback_media FOR EACH ROW "
        "EXECUTE FUNCTION enforce_business_line_immutable()"
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON task_feedback_media TO api_user")
    op.execute("ALTER TABLE task_feedback_media ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY task_feedback_media_select ON task_feedback_media "
        f"FOR SELECT USING (({_ADMIN}) OR ({_ASSIGNED_EMPLOYEE}))"
    )
    op.execute(
        f"CREATE POLICY task_feedback_media_insert ON task_feedback_media "
        f"FOR INSERT WITH CHECK ({_WRITABLE_ASSIGNED_EMPLOYEE})"
    )
    op.execute(
        f"CREATE POLICY task_feedback_media_delete ON task_feedback_media "
        f"FOR DELETE USING ({_WRITABLE_ASSIGNED_EMPLOYEE})"
    )


def _drop_processing_columns(table: str) -> None:
    # Tolerate a local/pre-release database that ran an earlier working-copy
    # version of this unmerged revision before the video-ready guard existed.
    op.execute(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "ck_{table}_{table}_video_ready"')
    op.drop_constraint(f"{table}_duration", table, type_="check")
    op.drop_constraint(f"{table}_processing_status", table, type_="check")
    op.drop_column(table, "sanitized_at")
    op.drop_column(table, "duration_seconds")
    op.drop_column(table, "processed_at")
    op.drop_column(table, "processing_started_at")
    op.drop_column(table, "processing_error_code")
    op.drop_column(table, "processing_status")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS task_feedback_media_delete ON task_feedback_media")
    op.execute("DROP POLICY IF EXISTS task_feedback_media_insert ON task_feedback_media")
    op.execute("DROP POLICY IF EXISTS task_feedback_media_select ON task_feedback_media")
    op.execute("ALTER TABLE task_feedback_media DISABLE ROW LEVEL SECURITY")
    op.execute("REVOKE SELECT, INSERT, DELETE ON task_feedback_media FROM api_user")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_task_feedback_media_business_line_immutable "
        "ON task_feedback_media"
    )
    op.execute("DROP INDEX IF EXISTS ix_task_feedback_media_uploaded_by_uuid")
    op.drop_index("ix_task_feedback_media_task_uuid", table_name="task_feedback_media")
    op.drop_table("task_feedback_media")

    # The previous schema cannot represent videos. Downgrading is therefore
    # intentionally lossy for media introduced by this revision; object-store
    # retention cleanup removes the now-unreferenced blobs separately.
    op.execute("DELETE FROM loan_documents WHERE content_type = 'video/mp4'")
    op.drop_index("ix_loan_documents_processing", table_name="loan_documents")
    op.drop_constraint("loan_documents_size", "loan_documents", type_="check")
    op.drop_constraint("loan_documents_content_type", "loan_documents", type_="check")
    _drop_processing_columns("loan_documents")

    op.execute("DELETE FROM property_media WHERE kind = 'video' OR position > 9")
    op.execute(
        'ALTER TABLE "property_media" DROP CONSTRAINT IF EXISTS '
        '"ck_property_media_property_media_video_ready"'
    )
    op.drop_constraint("property_media_duration", "property_media", type_="check")
    op.drop_constraint("property_media_position", "property_media", type_="check")
    op.drop_constraint("property_media_size", "property_media", type_="check")
    op.drop_constraint("property_media_kind_content_type", "property_media", type_="check")
    op.create_check_constraint(
        "property_media_content_type",
        "property_media",
        "content_type IN ('image/jpeg', 'image/png', 'image/webp')",
    )
    op.create_check_constraint(
        "property_media_size", "property_media", "size_bytes BETWEEN 1 AND 5242880"
    )
    op.create_check_constraint(
        "property_media_position", "property_media", "position BETWEEN 0 AND 9"
    )
    op.drop_column("property_media", "sanitized_at")
    op.drop_column("property_media", "duration_seconds")
    op.drop_column("property_media", "kind")

    op.execute("DELETE FROM property_submission_media WHERE kind = 'video' OR position > 11")
    op.drop_index("ix_property_submission_media_processing", table_name="property_submission_media")
    op.drop_constraint(
        "property_submission_media_position",
        "property_submission_media",
        type_="check",
    )
    op.drop_constraint(
        "property_submission_media_size",
        "property_submission_media",
        type_="check",
    )
    op.drop_constraint(
        "property_submission_media_kind_content_type",
        "property_submission_media",
        type_="check",
    )
    op.drop_constraint(
        "property_submission_media_kind",
        "property_submission_media",
        type_="check",
    )
    op.create_check_constraint(
        "property_submission_media_kind",
        "property_submission_media",
        "kind IN ('image', 'document')",
    )
    op.create_check_constraint(
        "property_submission_media_kind_content_type",
        "property_submission_media",
        "(kind = 'image' AND content_type IN ('image/jpeg', 'image/png', 'image/webp')) "
        "OR (kind = 'document' AND content_type = 'application/pdf')",
    )
    op.create_check_constraint(
        "property_submission_media_size",
        "property_submission_media",
        "size_bytes BETWEEN 1 AND 5242880",
    )
    op.create_check_constraint(
        "property_submission_media_position",
        "property_submission_media",
        "position BETWEEN 0 AND 11",
    )
    _drop_processing_columns("property_submission_media")
