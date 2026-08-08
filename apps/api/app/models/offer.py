"""Offers — Sub Admin content, no Admin-approval gate.

The second of four Sub Admin content tables (SubAdmin_Dashboard_System_Design.md
§5.2). Like banners, a SHARED content-team surface — any sub_admin sees every
offer, not just ones they created (migration b5c6d7e8f9a0). The sub_admin-owned
part of the lifecycle is draft -> scheduled -> active -> archived (forward-only,
app-layer guarded in services/offers.py); scheduled -> active and active ->
expired are written by the scheduler (app/jobs/cms_activation.py), not by any
request handler. Admin has read-only oversight only — no approve/reject step,
no bypass session.

discount_type is plain text (percentage/flat/cashback-tie), validated at the
schema layer rather than a DB enum (spec §5.2).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class OfferStatus(enum.StrEnum):
    DRAFT = "draft"
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
    # Empty object = generic/public. Non-empty rules are authenticated-only
    # and evaluated by services/personalization.py.
    audience_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[OfferStatus] = mapped_column(
        offer_status_enum, nullable=False, default=OfferStatus.DRAFT
    )
    # RLS owner axis for INSERT/UPDATE, keyed on app.auth_user_uuid.
    created_by_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
