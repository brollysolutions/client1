"""Referral bonus config schemas — Sub Admin rule authoring, no payout write.

ReferralBonusConfigRead exposes the full row. Rules can be made live or retired,
and only retired rules without referral history can be deleted.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ReferralBonusConfigCreate(BaseModel):
    business_line: str = Field(pattern="^(loans|real_estate)$")
    bonus_amount: Decimal = Field(ge=0)
    rule: dict[str, Any] = Field(default_factory=dict)
    active: bool = False


class ReferralBonusConfigUpdate(BaseModel):
    bonus_amount: Decimal | None = Field(default=None, ge=0)
    rule: dict[str, Any] | None = None
    active: bool | None = None

    @field_validator("bonus_amount", "rule", "active", mode="before")
    @classmethod
    def non_nullable_fields_cannot_be_cleared(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be null.")
        return value


class ReferralBonusConfigRead(BaseModel):
    id: UUID
    business_line: str
    bonus_amount: Decimal
    rule: dict[str, Any]
    active: bool
    created_by_uuid: UUID
    created_at: datetime
    updated_at: datetime
    is_referenced: bool = False


class ReferralBonusConfigListResponse(BaseModel):
    configs: list[ReferralBonusConfigRead]


class ReferralPayoutActivityRead(BaseModel):
    """Read-only projection of a referral_bonus transaction row, for the Sub
    Admin oversight view (spec §6.4). No write path into transactions exists
    from this router at all."""

    id: UUID
    user_uuid: UUID
    business_line: Literal["loans", "real_estate"]
    status: str
    amount_paise: int
    currency: str
    description: str
    created_at: datetime


class ReferralPayoutActivityListResponse(BaseModel):
    activity: list[ReferralPayoutActivityRead]
