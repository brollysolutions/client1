"""Referral bonus config — Sub Admin bonus-rule administration, no payout write.

The fourth of four Sub Admin content tables (SubAdmin_Dashboard_System_Design.md
§5.4). Shared content-team surface — any sub_admin sees every config, not just
ones they created (migration f9a0b1c2d3e4). Sub Admin sets the bonus RULES only:
amount, conditions, caps, and an active toggle. Payout execution is Admin/
finance's, written through the `transactions` ledger by a producer that does not
exist yet; this table has no FK to `transactions` and this slice's router never
writes there.

No status enum, unlike offers/content_blocks — `active` is a plain boolean, so
there is no forward-only lifecycle to guard in a services module.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, DateTime, Numeric
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class ReferralBonusConfig(Base):
    __tablename__ = "referral_bonus_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Line-tag for the customer-facing surface; immutable (shared trigger).
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    bonus_amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    rule: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # RLS owner axis for INSERT/UPDATE, keyed on app.auth_user_uuid.
    created_by_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
