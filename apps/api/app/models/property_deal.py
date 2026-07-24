"""Real estate line — the property_deals purchase-pipeline journey.

property_deals is the real-estate analogue of loan_applications (models/loan.py):
a staff-driven, trackable record distinct from the existing client-initiated
request forms enquiries/site_visits, which stay untouched. status is the
client-visible deal-progression axis, separate from leads.status (internal
lead-ownership, never shown to the client). Terms are informational-only
(price_quoted/booking_amount) — the platform never collects property payment
(SRS: mediator positioning), so there is no sanctioned-amount/disbursement
concept here the way loans has one.
"""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.profile import ClientProfile
from app.models.property import Property
from app.models.site_visit import SiteVisit
from app.models.user import business_line_enum


class PropertyDealStatus(enum.StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    SITE_VISIT_DONE = "site_visit_done"
    NEGOTIATION = "negotiation"
    BOOKED = "booked"
    AGREEMENT_SIGNED = "agreement_signed"
    CLOSED = "closed"
    REJECTED = "rejected"
    ON_HOLD = "on_hold"


_ev = lambda x: [e.value for e in x]  # noqa: E731
property_deal_status_enum = ENUM(
    PropertyDealStatus, name="property_deal_status", create_type=False, values_callable=_ev
)


class PropertyDeal(Base):
    __tablename__ = "property_deals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False
    )
    client_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_profiles.id"), nullable=False
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    site_visit_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("site_visits.id", ondelete="SET NULL"), nullable=True
    )
    # Explicit precision/scale (not bare Numeric): an unconstrained NUMERIC round-trips
    # through asyncpg as a Decimal in scientific notation for whole-rupee values
    # (e.g. "5E+5" instead of "500000.00"), which is wrong to hand a client verbatim.
    price_quoted: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    booking_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    status: Mapped[PropertyDealStatus] = mapped_column(
        property_deal_status_enum, nullable=False, default=PropertyDealStatus.NEW
    )
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    property: Mapped["Property"] = relationship("Property")
    client_profile: Mapped["ClientProfile"] = relationship("ClientProfile")
    site_visit: Mapped[Optional["SiteVisit"]] = relationship("SiteVisit")
