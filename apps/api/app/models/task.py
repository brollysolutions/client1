"""Field-task assignment spine — raised by a Telecaller and assigned
automatically to an eligible Employee on the matching business line.

Telecaller_Dashboard_System_Design.md Open Item A (decided yes) +
Employee_Dashboard_System_Design.md §5.1. Every task type shares this durable
assignment lifecycle; workflow-specific services own task creation and outcome.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class TaskType(enum.StrEnum):
    DOCUMENT_COLLECTION = "document_collection"
    PROPERTY_VISIT = "property_visit"
    BACKGROUND_CHECK = "background_check"


class TaskStatus(enum.StrEnum):
    UNASSIGNED = "unassigned"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    BLOCKED = "blocked"


class BgCheckOutcome(enum.StrEnum):
    CLEAR = "clear"
    FLAGGED = "flagged"
    INCONCLUSIVE = "inconclusive"


_ev = lambda x: [e.value for e in x]  # noqa: E731
task_type_enum = ENUM(TaskType, name="task_type", create_type=False, values_callable=_ev)
task_status_enum = ENUM(TaskStatus, name="task_status", create_type=False, values_callable=_ev)
bg_check_outcome_enum = ENUM(
    BgCheckOutcome, name="bg_check_outcome", create_type=False, values_callable=_ev
)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assigned_employee_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    raised_by_staff_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_profiles.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    task_type: Mapped[TaskType] = mapped_column(task_type_enum, nullable=False)
    lead_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False
    )
    status: Mapped[TaskStatus] = mapped_column(
        task_status_enum, nullable=False, default=TaskStatus.UNASSIGNED
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[BgCheckOutcome | None] = mapped_column(bg_check_outcome_enum, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class EmployeeAssignmentCursor(Base):
    """Internal per-line cursor shared by tasks and vehicle pickups."""

    __tablename__ = "employee_assignment_cursors"
    __table_args__ = (
        CheckConstraint(
            "business_line::text IN ('loans', 'real_estate')",
            name="business_line_operational",
        ),
    )

    business_line: Mapped[str] = mapped_column(business_line_enum, primary_key=True)
    last_employee_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class TaskDocument(Base):
    """One row per file collected during a document_collection task (§5.2).

    `verified`/`verified_by_profile_uuid`/`verified_at`/`review_note` are
    written by the Admin document-verification slice (FR-7.4,
    services/document_verification.py), never by the collecting employee —
    the RLS/GRANT split that makes this safe lives in migration
    c8d9e0f1a2b3.
    """

    __tablename__ = "task_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    doc_type: Mapped[str] = mapped_column(Text, nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_by_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_profiles.id"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )


class TaskFeedbackMedia(Base):
    """Private evidence attached by the assigned Employee to a property visit."""

    __tablename__ = "task_feedback_media"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    object_key: Mapped[str] = mapped_column(String(600), nullable=False, unique=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    sanitized_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
