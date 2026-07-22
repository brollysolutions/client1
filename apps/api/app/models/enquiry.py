"""Enquiries — real-estate client requests for staff follow-up on a listing.

Same hybrid shape as site_visits (migration 9c1d2e3f4a5b): identity-level owner
FK (user_uuid -> auth_users.id, keyed on app.auth_user_uuid so a "both"-line
client's real-estate enquiry never vanishes behind the JWT's loans-first
client_profile_uuid claim) plus a business_line column (always "real_estate")
and the standard staff/agent business_line RLS predicate, since real-estate
telecallers/employees/sub_admins/agents must action enquiries the way they
action site-visit requests.

property_ref/title/locality/city/contact_name/contact_mobile are denormalized
snapshots, not FKs — no properties table exists yet (mock listing catalog
lives in the web app only).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class EnquiryStatus(enum.StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    CLOSED = "closed"


_ev = lambda x: [e.value for e in x]  # noqa: E731
enquiry_status_enum = ENUM(
    EnquiryStatus, name="enquiry_status", create_type=False, values_callable=_ev
)


class Enquiry(Base):
    __tablename__ = "enquiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    # Immutable once set (enforce_business_line_immutable trigger, applied to
    # enquiries in this table's migration) — always "real_estate" for this
    # table, stamped server-side only, never client-supplied.
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    property_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[EnquiryStatus] = mapped_column(
        enquiry_status_enum, nullable=False, default=EnquiryStatus.NEW
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
