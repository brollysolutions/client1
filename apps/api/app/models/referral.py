"""Referral program — codes and the referrer -> referred edge (PR 1).

Two ERD deviations from master_erd.mermaid (docs/specs/referral-program.md D13):

  - `Referral.business_line` is NULLABLE, not NOT NULL. Unknown at signup
    (the referred person hasn't applied for a loan or a property yet); set
    exactly once at conversion. The shared enforce_business_line_immutable()
    trigger already permits the first NULL -> value assignment, which is
    exactly this shape.
  - `Referral.referred_auth_user_uuid` is an addition. Without it, the
    conversion hook (fires on every loan disbursal and every property-deal
    close) would need to join on the PII text column `referred_mobile`; with
    it, it's one indexed UUID lookup, and the mobile column becomes purely
    display/audit.

`ReferralCode` has no business_line column, so no immutability trigger on it
— the code is issued once, at signup, before the client has picked a line.

Both tables are SELECT-only for api_user (see the migration): all writes go
through services/referrals.py on the bypass session, mirroring
transactions/payouts.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class ReferralStatus(enum.StrEnum):
    PENDING = "pending"
    CONVERTED = "converted"
    ACCRUED = "accrued"
    PAID = "paid"
    VOID = "void"


_ev = lambda x: [e.value for e in x]  # noqa: E731
referral_status_enum = ENUM(
    ReferralStatus, name="referral_status", create_type=False, values_callable=_ev
)


class ReferralCode(Base):
    __tablename__ = "referral_codes"

    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="CASCADE"), primary_key=True
    )
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )


class Referral(Base):
    __tablename__ = "referrals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    referred_mobile: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    referred_auth_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=True
    )
    referred_lead_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True
    )
    # Provenance + first-assignment-only (see module docstring). Immutable via
    # the shared trigger once set.
    business_line: Mapped[str | None] = mapped_column(business_line_enum, nullable=True)
    conversion_status: Mapped[ReferralStatus] = mapped_column(
        referral_status_enum, nullable=False, default=ReferralStatus.PENDING
    )
    converted_ref_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    converted_ref_uuid: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    bonus_config_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referral_bonus_config.id"), nullable=True
    )
    # Paise, converted from referral_bonus_config.bonus_amount (rupees) at
    # accrual time — see services/referrals.py::_compute_amount_paise.
    bonus_amount_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # accrued | no_active_config | below_min_conversion | cap_reached |
    # referrer_not_client | self_referral
    accrual_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Written in PR 2 only (Admin execution) — NULL throughout PR 1.
    reward_txn_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=True
    )
    reward_payout_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payouts.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
