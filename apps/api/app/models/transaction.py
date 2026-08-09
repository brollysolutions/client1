"""Transactions — a client/agent's payout ledger (cashback, referral, commission).

Identity-level owner (like support_tickets/notifications): RLS keys on
app.auth_user_uuid, not client_profile_uuid. This is deliberate, not just for
consistency — commission payouts go to AGENTS, not clients, so the owner must
be the account identity, which is what makes this correct for both.

business_line is immutable provenance metadata and always identifies one
operational line. RLS remains identity-owned because commission payouts go to
agents, but classification is still required for reconciliation and reporting.

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
    # Nullable + SET NULL: account deletion de-links this row from the identity
    # instead of deleting it (SRS 5.1 — retain financial records 7 years, but
    # not against the deleted person's own PII). retained_ref/delinked_at below
    # carry the de-link's internal reference and the future purge job's anchor.
    user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    # Immutable operational provenance; no RLS branch reads this column.
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    type: Mapped[TransactionType] = mapped_column(transaction_type_enum, nullable=False)
    status: Mapped[TransactionStatus] = mapped_column(
        transaction_status_enum, nullable=False, default=TransactionStatus.PENDING
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    # External payout id / future money-layer idempotency key.
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Set only at account-deletion de-link time (never at created_at). Internal
    # reference to the now-scrubbed identity (its former auth_users.id, which is
    # never hard-deleted) — not the person's own PII.
    retained_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Anchor for the future 7-year retention-purge job (SRS 5.1): the clock
    # starts at de-link, not at record creation.
    delinked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
