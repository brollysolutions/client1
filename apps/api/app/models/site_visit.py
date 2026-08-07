"""Site visits — real-estate client requests to view a listing in person.

Hybrid shape, deliberately NOT copying loan_applications' client_profile_uuid
FK: the JWT only ever carries a SINGLE client_profile_uuid claim, picked
loans-first by auth_service._build_access_claims (see
test_loans_api.py::test_both_line_client_still_sees_loans_application). A
"both"-line client's real-estate site visit would silently vanish from their
own RLS-scoped view under that shape, because the JWT in hand at request time
carries the loans profile, not the real-estate one.

Instead this follows support_tickets' identity-level FK (auth_user_uuid ->
auth_users.id, named user_uuid here for readability — it is the same GUC,
app.auth_user_uuid, set from the same JWT `sub` claim, not a per-line
profile), but — unlike support_tickets — ADDS a business_line column (always
"real_estate") plus the standard staff/agent business_line RLS predicate from
loan_applications, since real-estate telecallers/employees/sub_admins/agents
need to see site-visit requests the way loans staff see loan_applications.

property_ref/title/locality/city/contact_name/contact_mobile are denormalized
snapshots, not FKs — no properties table exists yet (mock listing catalog
lives in the web app only).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import business_line_enum

if TYPE_CHECKING:
    from app.models.vehicle_arrangement import VehicleArrangement


class SiteVisitTimeSlot(enum.StrEnum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"


class SiteVisitStatus(enum.StrEnum):
    REQUESTED = "requested"
    CONFIRMED = "confirmed"
    DONE = "done"
    CANCELLED = "cancelled"


_ev = lambda x: [e.value for e in x]  # noqa: E731
site_visit_time_slot_enum = ENUM(
    SiteVisitTimeSlot, name="site_visit_time_slot", create_type=False, values_callable=_ev
)
site_visit_status_enum = ENUM(
    SiteVisitStatus, name="site_visit_status", create_type=False, values_callable=_ev
)


class SiteVisit(Base):
    __tablename__ = "site_visits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    # Immutable once set (enforce_business_line_immutable trigger, applied to
    # site_visits in this table's migration) — always "real_estate" for this
    # table, stamped server-side only, never client-supplied.
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    property_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    preferred_date: Mapped[date] = mapped_column(Date, nullable=False)
    preferred_time_slot: Mapped[SiteVisitTimeSlot] = mapped_column(
        site_visit_time_slot_enum, nullable=False
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[SiteVisitStatus] = mapped_column(
        site_visit_status_enum, nullable=False, default=SiteVisitStatus.REQUESTED
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    vehicle_arrangement: Mapped[VehicleArrangement | None] = relationship(
        "VehicleArrangement",
        back_populates="site_visit",
        uselist=False,
        cascade="all, delete-orphan",
    )
