"""Field-task assignment spine — raised by a telecaller against an assigned
lead, landed in an unassigned pool, handed to an employee by Admin.

Telecaller_Dashboard_System_Design.md Open Item A (decided yes) +
Employee_Dashboard_System_Design.md §5.1. This slice only exercises
task_type='document_collection'; property_visit/background_check are created
now so a later Employee-dashboard slice extends this table, not re-migrates it.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text
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


_ev = lambda x: [e.value for e in x]  # noqa: E731
task_type_enum = ENUM(TaskType, name="task_type", create_type=False, values_callable=_ev)
task_status_enum = ENUM(TaskStatus, name="task_status", create_type=False, values_callable=_ev)


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
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
