"""Company-managed pickup logistics for one real-estate site visit."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import business_line_enum

if TYPE_CHECKING:
    from app.models.profile import StaffProfile
    from app.models.site_visit import SiteVisit


class VehicleArrangementStatus(enum.StrEnum):
    REQUESTED = "requested"
    ARRANGED = "arranged"
    ASSIGNED = "assigned"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


_ev = lambda x: [e.value for e in x]  # noqa: E731
vehicle_arrangement_status_enum = ENUM(
    VehicleArrangementStatus,
    name="vehicle_arrangement_status",
    create_type=False,
    values_callable=_ev,
)


class VehicleArrangement(Base):
    __tablename__ = "vehicle_arrangements"
    __table_args__ = (CheckConstraint("business_line = 'real_estate'", name="real_estate_only"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_visit_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("site_visits.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    pickup_location: Mapped[str] = mapped_column(String(500), nullable=False)
    pickup_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[VehicleArrangementStatus] = mapped_column(
        vehicle_arrangement_status_enum,
        nullable=False,
        default=VehicleArrangementStatus.REQUESTED,
    )
    vehicle_make_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    vehicle_registration: Mapped[str | None] = mapped_column(String(40), nullable=True)
    driver_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    driver_mobile: Mapped[str | None] = mapped_column(String(20), nullable=True)
    assigned_employee_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    arranged_by_staff_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    site_visit: Mapped[SiteVisit] = relationship("SiteVisit", back_populates="vehicle_arrangement")
    assigned_employee: Mapped[StaffProfile | None] = relationship(
        "StaffProfile", foreign_keys=[assigned_employee_profile_uuid]
    )
    arranged_by_staff: Mapped[StaffProfile | None] = relationship(
        "StaffProfile", foreign_keys=[arranged_by_staff_profile_uuid]
    )
