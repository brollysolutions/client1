"""Processing-fee cashback — per-loan-application ledger (FR-6.6).

"The processing fee shall be either waived or returned to the lead as
cashback" on successful conversion. The *declaration* half of this already
existed before this table: `loan_applications.processing_fee` (rupees) and
the `fee_outcome` enum (`waived` / `cashback` / `none`), writable by
Telecaller/Admin once the application reaches SANCTIONED
(services/loan_applications.py). This table is the money-movement half —
Admin enters an amount against a `fee_outcome='cashback'` application and
raises a payout through the existing RazorpayX maker-checker rails, the
identical structural shape agent commissions (models/commission.py) used.

`amount_paise` (BigInteger), not the loan row's Numeric rupees: every column
on the payout path (payouts.amount_paise, transactions.amount_paise,
commissions.agreed_amount_paise) is integer minor units; a NUMERIC here would
need a lossy conversion at exactly the payout boundary this table feeds
into. `processing_fee_paise` is a SNAPSHOT of `loan_applications.processing_fee`
taken at entry time (converted rupees*100, exact since the source column is
NUMERIC(14,2)) — the loan row stays independently editable afterwards, and
the cashback record must not silently track a number that changed after
entry.

No client-facing earnings ledger (unlike agent commissions'
/dashboard/earnings): a client's cashback is a refund they didn't ask for,
not income they need to chase, and a `pending` list would promise money
maker-checker can still reject. The client sees it land as a `cashback`
`Transaction` row at /dashboard/transactions once paid.

RLS keys the client's own-row branch on `recipient_auth_user_uuid` (identity)
with NO business_line predicate — see the migration docstring
(e4f5a6b7c8d9) for why: unlike an agent (single-line by definition), a
client's `app.business_line` JWT claim is literally "both" for every
self-registered account.

The linked payout row, rather than this cashback source row, owns the selected
UPI/bank/cheque method and provider lifecycle.
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


class FeeCashbackStatus(enum.StrEnum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"


_ev = lambda x: [e.value for e in x]  # noqa: E731
fee_cashback_status_enum = ENUM(
    FeeCashbackStatus, name="fee_cashback_status", create_type=False, values_callable=_ev
)


class FeeCashback(Base):
    __tablename__ = "fee_cashbacks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_application_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_applications.id"), nullable=False
    )
    client_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_profiles.id"), nullable=False
    )
    recipient_auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    # Snapshot at entry time — see module docstring.
    processing_fee_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[FeeCashbackStatus] = mapped_column(
        fee_cashback_status_enum, nullable=False, default=FeeCashbackStatus.PENDING
    )
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
