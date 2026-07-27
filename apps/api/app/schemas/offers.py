"""Offer schemas — Sub Admin drafts in, lifecycle out.

OfferRead exposes the full row; there is no client-authored status field — status
only moves via schedule/activate/archive actions.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.offer import OfferStatus

_DISCOUNT_TYPES = ("percentage", "flat", "cashback-tie")


class OfferCreate(BaseModel):
    business_line: str = Field(pattern="^(loans|real_estate|both)$")
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    discount_type: str = Field(pattern="^(percentage|flat|cashback-tie)$")
    discount_value: Decimal = Field(ge=0)
    code: str | None = Field(default=None, max_length=100)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="after")
    def _check_percentage_bounds(self) -> OfferCreate:
        if self.discount_type == "percentage" and self.discount_value > 100:
            raise ValueError("discount_value cannot exceed 100 for a percentage offer.")
        return self


class OfferUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    discount_type: str | None = Field(default=None, pattern="^(percentage|flat|cashback-tie)$")
    discount_value: Decimal | None = Field(default=None, ge=0)
    code: str | None = Field(default=None, max_length=100)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="after")
    def _check_percentage_bounds(self) -> OfferUpdate:
        if (
            self.discount_type == "percentage"
            and self.discount_value is not None
            and self.discount_value > 100
        ):
            raise ValueError("discount_value cannot exceed 100 for a percentage offer.")
        return self


class OfferRead(BaseModel):
    id: UUID
    business_line: str
    title: str
    description: str | None
    discount_type: str
    discount_value: Decimal
    code: str | None
    status: OfferStatus
    created_by_uuid: UUID
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime


class OfferListResponse(BaseModel):
    offers: list[OfferRead]


class PublicOfferRead(BaseModel):
    """Anonymous-read shape (docs/specs/public-offer-serving.md).

    Deliberately NOT a subclass of OfferRead -- a future sensitive column
    added to the authenticated read can never silently surface here.

    - status: constant "active" by construction on this path (see
      services/public_catalog.py::list_public_offers). Exposing a constant
      invites a client-side filter that would quietly become the de-facto
      access control.
    - created_by_uuid: staff identity, never public.
    - starts_at / ends_at: the endpoint has already applied the window;
      republishing it lets a client second-guess the server and discloses
      unlaunched-campaign timing (same reasoning as PublicBannerRead).
    - created_at: internal metadata, no display use.

    business_line IS included, unlike PublicBannerRead: offers are line-scoped
    by design (an offer applies to loans, real_estate, or both) and the
    frontend needs it to decide which strip(s) an offer renders in.
    """

    id: UUID
    business_line: str
    title: str
    description: str | None
    discount_type: str
    discount_value: Decimal
    code: str | None


class PublicOfferListResponse(BaseModel):
    offers: list[PublicOfferRead]
