"""Referral bonus config schemas — Sub Admin rule authoring, no payout write.

ReferralBonusConfigRead exposes the full row. There is no forward-only status
machine here (unlike offers/content_blocks) — active is a plain toggle, so
ReferralBonusConfigUpdate can flip it directly alongside the other fields.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ReferralBonusConfigCreate(BaseModel):
    business_line: str = Field(pattern="^(loans|real_estate|both)$")
    bonus_amount: Decimal = Field(ge=0)
    rule: dict[str, Any] = Field(default_factory=dict)
    active: bool = False


class ReferralBonusConfigUpdate(BaseModel):
    bonus_amount: Decimal | None = Field(default=None, ge=0)
    rule: dict[str, Any] | None = None
    active: bool | None = None


class ReferralBonusConfigRead(BaseModel):
    id: UUID
    business_line: str
    bonus_amount: Decimal
    rule: dict[str, Any]
    active: bool
    created_by_uuid: UUID
    created_at: datetime
    updated_at: datetime


class ReferralBonusConfigListResponse(BaseModel):
    configs: list[ReferralBonusConfigRead]


class ReferralPayoutActivityRead(BaseModel):
    """Read-only projection of a referral_bonus transaction row, for the Sub
    Admin oversight view (spec §6.4). No write path into transactions exists
    from this router at all."""

    id: UUID
    user_uuid: UUID
    business_line: str | None
    status: str
    amount_paise: int
    currency: str
    description: str
    created_at: datetime


class ReferralPayoutActivityListResponse(BaseModel):
    activity: list[ReferralPayoutActivityRead]
