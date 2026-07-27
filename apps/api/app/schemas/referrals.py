"""Referral schemas — client's own code + conversion tracking. Read-only.

No create/update schema: a client never writes a referral_codes or referrals
row directly. Codes are issued by services/referrals.py::issue_code (self-heal
on GET /me, or the 6-hour backfill job); referrals rows are written by
attribute_signup (registration) and record_conversion (loan/deal hooks), both
on the bypass session.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


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
