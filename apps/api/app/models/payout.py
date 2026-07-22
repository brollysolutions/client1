"""Payouts — the admin/gateway workflow for disbursing cashback / referral /
commission money to platform users via RazorpayX.

Sidecar to `transactions`, deliberately NOT an extension of it:
  - `transactions` is the recipient-owned, client-facing, immutable money LEDGER
    (RLS keys on app.auth_user_uuid). It stays generic and read-only.
  - `payouts` is an ADMIN-ONLY workflow object (RLS keys on app.platform_scope):
    maker-checker approval, gateway ids, masked destination, safety metadata. The
    recipient must never see this machinery.

On a successful settle (webhook `payout.processed`, or the mock producer), the
service emits ONE `transactions` row (status `paid`) via the bypass-session
producer pattern and stores its id back in `ledger_transaction_id`, which makes
ledger emission idempotent against webhook redelivery.

PII minimisation: the raw UPI VPA / bank account is handed to RazorpayX (contact
+ fund_account) and NEVER persisted here. Only the gateway ids and a MASKED
`destination_hint` (e.g. "***@okhdfc", "HDFC ****4321") are stored.

Money is integer minor units (amount_paise), never a float.
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


class PayoutType(enum.StrEnum):
    CASHBACK = "cashback"
    REFERRAL_BONUS = "referral_bonus"
    COMMISSION = "commission"


class PayoutStatus(enum.StrEnum):
    PENDING_APPROVAL = "pending_approval"  # maker created; awaiting a checker
    APPROVED = "approved"  # checker approved; about to hit the gateway
    REJECTED = "rejected"  # checker rejected (terminal)
    INITIATED = "initiated"  # accepted by RazorpayX; awaiting webhook
    PROCESSING = "processing"  # gateway processing (optional interim from webhook)
    PAID = "paid"  # settled; ledger row emitted (terminal)
    FAILED = "failed"  # gateway/validation failure (terminal)
    REVERSED = "reversed"  # money returned after processing (terminal)


class PayoutDestination(enum.StrEnum):
    VPA = "vpa"  # UPI virtual payment address
    BANK_ACCOUNT = "bank_account"  # IFSC + account number


_ev = lambda x: [e.value for e in x]  # noqa: E731
payout_type_enum = ENUM(PayoutType, name="payout_type", create_type=False, values_callable=_ev)
payout_status_enum = ENUM(
    PayoutStatus, name="payout_status", create_type=False, values_callable=_ev
)
payout_destination_enum = ENUM(
    PayoutDestination, name="payout_destination", create_type=False, values_callable=_ev
)


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    # Provenance only (null = platform-level, e.g. referral); copied onto the
    # emitted ledger row. No RLS branch reads it (same stance as transactions).
    business_line: Mapped[str | None] = mapped_column(business_line_enum, nullable=True)
    type: Mapped[PayoutType] = mapped_column(payout_type_enum, nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    status: Mapped[PayoutStatus] = mapped_column(
        payout_status_enum, nullable=False, default=PayoutStatus.PENDING_APPROVAL
    )

    destination_type: Mapped[PayoutDestination] = mapped_column(
        payout_destination_enum, nullable=False
    )
    # MASKED only — never the raw VPA/account (see module docstring).
    destination_hint: Mapped[str] = mapped_column(String(40), nullable=False)

    # Dedupe / idempotency anchor. Unique per active window via the partial-unique
    # index (see migration); terminal-dead states free the key for a legit retry.
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)

    # Maker-checker audit. checker must differ from maker (enforced in the app).
    maker_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    checker_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=True
    )
    rejected_by_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=True
    )
    reject_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # RazorpayX gateway audit (all null in mock mode until initiate).
    gateway_contact_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gateway_fund_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gateway_payout_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gateway_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Set once on settle → makes ledger emission idempotent vs webhook redelivery.
    ledger_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=True
    )
    # Set once on a post-payment reversal → links the compensating (negative)
    # clawback ledger row and makes that emission idempotent (paired with the
    # PAID→REVERSED compare-and-swap in services.payments.settle_from_webhook).
    reversal_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
