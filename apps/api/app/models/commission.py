"""Agent commissions — per-deal ledger (FR-8.1/8.2, IDR v1.4 §5.5).

No fixed rate; the negotiated amount is entered manually by Admin, per agent,
per deal. One row per converted deal that earns the agent commission.

Two deviations from master_erd.mermaid, recorded in
docs/specs/agent-commission.md:

  - `property_deal_uuid`, not the ERD's `property_inquiry_uuid`. The ERD
    predates `property_deals` (PR #95); `property_inquiries` was never built
    and `property_deals` is its real successor.
  - `agreed_amount_paise` (BigInteger), not the ERD's NUMERIC. Every column on
    the payout path (payouts.amount_paise, transactions.amount_paise) is
    integer minor units; a NUMERIC here would need a lossy conversion at
    exactly the payout boundary this table feeds into.

Status machine deliberately collapses the ERD's four states
(pending -> approved -> paid) into three: pending -> paid (+ cancelled).
Raising a payout (PR 2) IS the approval act, and the payout's own
maker-checker is the second pair of eyes — a separate "approve commission"
step would put two humans on the same rupees twice. See
docs/specs/agent-commission.md D1.

The linked payout row, rather than this commission source row, owns the selected
UPI/bank/cheque method and provider lifecycle.

RLS keys on `agent_auth_user_uuid` (identity), not `agent_profile_uuid`: an
agent's JWT carries `app.auth_user_uuid` directly, so this is a plain equality
predicate with no join, matching how transactions/commissions'-sibling tables
(referrals, notifications, support_tickets) key identity-level ownership.
`agent_profile_uuid` is kept alongside for display (agent_code, line) without
forcing every RLS read through a join.
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


class CommissionStatus(enum.StrEnum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"


_ev = lambda x: [e.value for e in x]  # noqa: E731
commission_status_enum = ENUM(
    CommissionStatus, name="commission_status", create_type=False, values_callable=_ev
)


class Commission(Base):
    __tablename__ = "commissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    agent_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_profiles.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    lead_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False
    )
    loan_application_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_applications.id"), nullable=True
    )
    property_deal_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_deals.id"), nullable=True
    )
    agreed_amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[CommissionStatus] = mapped_column(
        commission_status_enum, nullable=False, default=CommissionStatus.PENDING
    )
    # Written in PR 2 only (payout execution) — NULL throughout PR 1.
    payout_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payouts.id"), nullable=True
    )
    payout_txn_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=True
    )
    entered_by_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
