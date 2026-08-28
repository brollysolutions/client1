"""Reviewed dashboard offers authored by Sub Admin and decided by Admin.

The queue is shared for operational visibility, while RLS and service guards
keep authoring mutations owner-scoped. The lifecycle is draft/rejected ->
pending approval -> approved -> scheduled/active -> expired/archived. Scheduled
activation and expiry remain scheduler-owned.

discount_type is plain text (percentage/flat/cashback-tie), validated at the
schema layer rather than a DB enum (spec §5.2).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class OfferStatus(enum.StrEnum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    EXPIRED = "expired"
    ARCHIVED = "archived"


_ev = lambda x: [e.value for e in x]  # noqa: E731
offer_status_enum = ENUM(OfferStatus, name="offer_status", create_type=False, values_callable=_ev)


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = (CheckConstraint("priority >= 0", name="priority_nonnegative"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Line-tag for the customer-facing surface; immutable (shared trigger).
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # percentage / flat / cashback-tie — validated in schemas/offers.py, not a DB enum.
    discount_type: Mapped[str] = mapped_column(Text, nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    partner_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    redemption_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Uses the existing sanitized banner-image upload boundary. The shared
    # orphan sweep treats both Banner.image_key and Offer.image_key as live
    # references. The catalogue itself remains authenticated and private/no-store.
    image_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    audience_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[OfferStatus] = mapped_column(
        offer_status_enum, nullable=False, default=OfferStatus.DRAFT
    )
    # RLS owner axis for INSERT/UPDATE, keyed on app.auth_user_uuid.
    created_by_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
