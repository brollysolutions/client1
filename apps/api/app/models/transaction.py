"""Transactions — a client/agent's payout ledger (cashback, referral, commission).

Identity-level owner (like support_tickets/notifications): RLS keys on
app.auth_user_uuid, not client_profile_uuid. This is deliberate, not just for
consistency — commission payouts go to AGENTS, not clients, so the owner must
be the account identity, which is what makes this correct for both.

business_line is nullable PROVENANCE metadata (null = platform-level, e.g.
referral; "loans" = loan-cashback origin), not an access axis: no RLS branch
reads it, so it can't reproduce the client_profile_uuid single-claim gap, and
there is no line-staff visibility to segregate here (a payout is an
account-level financial record). Unlike enquiries/bookmarks, this column is
NOT wrapped in the enforce_business_line_immutable trigger — it isn't
RLS-load-bearing and there is no client write path to guard.

No producers exist yet (the money layer / Razorpay integration is a separate,
later milestone), so this table ships empty in production; only SELECT is
granted to api_user (read-only for the client) and rows are inserted later by
that future producer on a bypass session, mirroring how notifications are
written.

Money is integer minor units (amount_paise), never a float, so wire and DB
values are exact.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class TransactionType(enum.StrEnum):
    CASHBACK = "cashback"
    REFERRAL_BONUS = "referral_bonus"
    COMMISSION = "commission"


class TransactionStatus(enum.StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    PAID = "paid"
    FAILED = "failed"


_ev = lambda x: [e.value for e in x]  # noqa: E731
transaction_type_enum = ENUM(
    TransactionType, name="transaction_type", create_type=False, values_callable=_ev
)
transaction_status_enum = ENUM(
    TransactionStatus, name="transaction_status", create_type=False, values_callable=_ev
)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    # Provenance only — no RLS branch reads this column (see module docstring).
    business_line: Mapped[str | None] = mapped_column(business_line_enum, nullable=True)
    type: Mapped[TransactionType] = mapped_column(transaction_type_enum, nullable=False)
    status: Mapped[TransactionStatus] = mapped_column(
        transaction_status_enum, nullable=False, default=TransactionStatus.PENDING
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    # External payout id / future money-layer idempotency key.
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
