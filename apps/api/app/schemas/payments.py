"""Payout schemas — admin create/read + webhook ack.

The create body carries the RAW destination (UPI VPA or bank account); it is
handed to RazorpayX and never persisted. Every read response is masked
(destination_hint only) and never echoes raw bank/UPI PII.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.payout import PayoutDestination, PayoutStatus, PayoutType


class PayoutDestinationInput(BaseModel):
    """Raw destination — validated to match destination_type, never stored raw."""

    vpa: str | None = Field(default=None, max_length=100)
    ifsc: str | None = Field(default=None, max_length=20)
    # min 6 so mask_bank_account never returns a fully-visible short number.
    account_number: str | None = Field(default=None, min_length=6, max_length=40)
    name: str | None = Field(default=None, max_length=120)


class PayoutCreate(BaseModel):
    recipient_user_uuid: UUID
    type: PayoutType
    business_line: Literal["loans", "real_estate"] | None = None
    # Upper bound guards against an accidental extra-zero disbursement and keeps
    # sums well inside BigInteger. ₹100,000,000 (10^10 paise) is far above any
    # real cashback/referral/commission; the per-payout cap tightens it further.
    amount_paise: int = Field(gt=0, le=10_000_000_000)
    destination_type: PayoutDestination
    destination: PayoutDestinationInput
    idempotency_key: str = Field(min_length=8, max_length=64)

    @model_validator(mode="after")
    def _require_matching_destination(self) -> PayoutCreate:
        if self.destination_type == PayoutDestination.VPA:
            if not self.destination.vpa or "@" not in self.destination.vpa:
                raise ValueError("A valid UPI VPA (name@bank) is required for a vpa payout.")
        else:  # bank_account
            if not self.destination.ifsc or not self.destination.account_number:
                raise ValueError("ifsc and account_number are required for a bank_account payout.")
        return self


class PayoutRead(BaseModel):
    id: UUID
    recipient_user_uuid: UUID | None
    type: PayoutType
    business_line: str | None
    amount_paise: int
    currency: str
    status: PayoutStatus
    destination_type: PayoutDestination
    destination_hint: str
    maker_user_uuid: UUID
    checker_user_uuid: UUID | None
    rejected_by_user_uuid: UUID | None
    reject_reason: str | None
    gateway_payout_id: str | None
    gateway_status: str | None
    failure_reason: str | None
    reversal_transaction_id: UUID | None
    created_at: datetime
    updated_at: datetime

    # Enriched for display only (services.payout_recipients.resolve_identities).
    # ALWAYS nullable: a platform Sub Admin caller legitimately resolves nothing
    # here (auth_users_rls scopes the full-table bypass to role='admin'), and a
    # recipient whose profile rows are gone resolves to None too. Never mobile
    # or email here — see PayoutRecipientRead for the search-only mobile_last4.
    recipient_name: str | None = None
    recipient_code: str | None = None
    maker_name: str | None = None
    checker_name: str | None = None
    rejected_by_name: str | None = None


class PayoutListResponse(BaseModel):
    payouts: list[PayoutRead]


class PayoutReject(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


class WebhookAck(BaseModel):
    status: str = "ok"


class PayoutRecipientRead(BaseModel):
    """One recipient-search hit. mobile_last4 (not full mobile) is the standard
    bank/UPI confirmation affordance for disambiguating a name collision without
    putting a full mobile number into a broad admin payload."""

    auth_user_uuid: UUID
    name: str
    codes: list[str]
    kind: Literal["client", "agent", "staff"]
    mobile_last4: str


class PayoutRecipientListResponse(BaseModel):
    recipients: list[PayoutRecipientRead]
