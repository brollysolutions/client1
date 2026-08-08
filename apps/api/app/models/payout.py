"""Payouts — the Admin workflow for disbursing cashback / referral / commission
money through an online provider or an audited manual cheque.

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

PII minimisation: raw UPI VPA / bank account details are handed to RazorpayX and
never persisted. A raw cheque reference exists only in the issuance request; the
row retains a masked hint and keyed fingerprint. Gateway ids remain provider
audit metadata.

Money is integer minor units (amount_paise), never a float.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

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
    APPROVED = "approved"  # checker approved; ready for provider/manual issuance
    REJECTED = "rejected"  # checker rejected (terminal)
    INITIATED = "initiated"  # accepted by RazorpayX; awaiting webhook
    PROCESSING = "processing"  # gateway processing or cheque issued/awaiting clearance
    PAID = "paid"  # settled; ledger row emitted (terminal)
    FAILED = "failed"  # gateway/validation failure (terminal)
    REVERSED = "reversed"  # money returned after processing (terminal)


class PayoutDestination(enum.StrEnum):
    VPA = "vpa"  # UPI virtual payment address
    BANK_ACCOUNT = "bank_account"  # IFSC + account number
    CHEQUE = "cheque"  # offline cheque; reference is supplied only at issuance


class PayoutProvider(enum.StrEnum):
    """Execution boundary, deliberately separate from the destination rail."""

    RAZORPAYX = "razorpayx"
    MANUAL = "manual"


_ev = lambda x: [e.value for e in x]  # noqa: E731
payout_type_enum = ENUM(PayoutType, name="payout_type", create_type=False, values_callable=_ev)
payout_status_enum = ENUM(
    PayoutStatus, name="payout_status", create_type=False, values_callable=_ev
)
payout_destination_enum = ENUM(
    PayoutDestination, name="payout_destination", create_type=False, values_callable=_ev
)
payout_provider_enum = ENUM(
    PayoutProvider, name="payout_provider", create_type=False, values_callable=_ev
)


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nullable + SET NULL: account deletion de-links this row from the identity
    # instead of deleting it (SRS 5.1). retained_ref/delinked_at carry the
    # de-link's internal reference and the future purge job's anchor.
    recipient_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
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
    provider: Mapped[PayoutProvider] = mapped_column(
        payout_provider_enum,
        nullable=False,
        default=PayoutProvider.RAZORPAYX,
        server_default=PayoutProvider.RAZORPAYX.value,
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

    # Online-provider audit (all null for a manual cheque).
    gateway_contact_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gateway_fund_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gateway_payout_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gateway_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Manual-cheque state. The raw reference is never persisted: only a masked
    # display hint above plus this keyed fingerprint used to reject accidental
    # cheque reuse. Both timestamps are server-authored workflow evidence.
    manual_reference_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    manual_issued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    manual_cleared_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

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

    # Set only at account-deletion de-link time (never at created_at). Internal
    # reference to the now-scrubbed recipient identity (their former
    # auth_users.id, which is never hard-deleted) — not the person's own PII.
    retained_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Anchor for the future 7-year retention-purge job (SRS 5.1): the clock
    # starts at de-link, not at record creation.
    delinked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
