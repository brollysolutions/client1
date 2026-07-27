"""Referral schemas — client's own code + conversion tracking, plus (PR 2)
Admin oversight and payout execution.

The client-facing schemas below stay read-only: a client never writes a
referral_codes or referrals row directly. Codes are issued by
services/referrals.py::issue_code (self-heal on GET /me, or the 6-hour
backfill job); referrals rows are written by attribute_signup (registration)
and record_conversion (loan/deal hooks), both on the bypass session.

The Admin schemas add the one legitimate write: turning an accrued row into a
real payout. ReferralPayoutRequest deliberately carries no amount or recipient
— both come from the referral row itself (services/referrals.py::attach_payout),
never from the request body.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, model_validator

from app.models.payout import PayoutDestination
from app.schemas.payments import PayoutDestinationInput


class ReferralStats(BaseModel):
    total: int
    pending: int
    converted: int
    accrued: int
    paid: int
    void: int
    accrued_amount_paise: int
    paid_amount_paise: int


class MyReferralResponse(BaseModel):
    code: str | None
    eligible: bool
    ineligible_reason: Literal["agent", "staff", "no_client_profile"] | None
    stats: ReferralStats


class ReferralRead(BaseModel):
    id: UUID
    # Never the raw number — see app/core/masking.py::mask_mobile. The raw
    # referred_mobile column is never projected into any response.
    referred_mobile_masked: str
    business_line: str | None
    conversion_status: str
    bonus_amount_paise: int | None
    converted_at: datetime | None
    created_at: datetime


class ReferralListResponse(BaseModel):
    referrals: list[ReferralRead]


# ---------------------------------------------------------------------------
# Admin (PR 2)
# ---------------------------------------------------------------------------


class AdminReferralRead(BaseModel):
    """Adds what ReferralRead deliberately withholds from the client: the
    accrual reason (so Admin can see WHY a converted row never accrued) and
    the reward linkage. Still only the masked mobile — D15 holds for Admin
    reads too, the raw column is never serialized anywhere."""

    id: UUID
    referrer_auth_user_uuid: UUID
    referrer_name: str | None = None
    referrer_code: str | None = None
    referred_mobile_masked: str
    business_line: str | None
    conversion_status: str
    accrual_reason: str | None
    bonus_amount_paise: int | None
    reward_payout_uuid: UUID | None
    reward_txn_uuid: UUID | None
    converted_at: datetime | None
    created_at: datetime


class AdminReferralListResponse(BaseModel):
    referrals: list[AdminReferralRead]


class ReferralPayoutRequest(BaseModel):
    """No amount, no recipient, no idempotency key: only the destination the
    referrer will actually receive money at. Amount and recipient come from
    the referral row (D-invariant, see the router). The idempotency key is
    derived server-side from the referral id (`ref-{uuid.hex}`), not accepted
    from the client — a client-chosen key let two concurrent "Pay bonus"
    clicks (two tabs, two admins) each pick a fresh key and both slip past
    create_payout's dedupe guard, creating a second, orphaned pending_approval
    payout no later check ever reconciled. A deterministic per-referral key
    makes the second concurrent create collide with the first inside
    create_payout itself (the dedupe window, or the partial-unique index on a
    genuine race) — the orphan can no longer be created at all, not just
    caught after the fact."""

    destination_type: PayoutDestination
    destination: PayoutDestinationInput

    # Same shape as PayoutCreate._require_matching_destination
    # (schemas/payments.py) — duplicated rather than shared because the two
    # request bodies are otherwise unrelated and a shared base would obscure
    # more than it saves for two fields.
    @model_validator(mode="after")
    def _require_matching_destination(self) -> ReferralPayoutRequest:
        if self.destination_type == PayoutDestination.VPA:
            if not self.destination.vpa or "@" not in self.destination.vpa:
                raise ValueError("A valid UPI VPA (name@bank) is required for a vpa payout.")
        else:  # bank_account
            if not self.destination.ifsc or not self.destination.account_number:
                raise ValueError("ifsc and account_number are required for a bank_account payout.")
        return self


class ReferralPayoutResponse(BaseModel):
    payout_id: UUID
