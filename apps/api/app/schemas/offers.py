"""Contracts for reviewed, dashboard-only partner coupon campaigns."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.offer import OfferStatus
from app.schemas.personalization import AudienceRules, audience_rules_valid_for_offer

_DISCOUNT_TYPES = ("percentage", "flat", "cashback-tie")
_IMAGE_KEY_PATTERN = (
    r"^public/(banners|campaign-media)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
    r"[0-9a-f]{4}-[0-9a-f]{12}"
    r"/[A-Za-z0-9._-]+$"
)


def _validate_partner_url(value: str | None) -> str | None:
    if value is None:
        return None
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Use an HTTPS partner URL without embedded credentials.")
    return value


class OfferCreate(BaseModel):
    business_line: str = Field(pattern="^(loans|real_estate|both)$")
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    discount_type: str = Field(pattern="^(percentage|flat|cashback-tie)$")
    discount_value: Decimal = Field(ge=0)
    code: str | None = Field(default=None, max_length=100)
    partner_name: str | None = Field(default=None, max_length=200)
    redemption_url: str | None = Field(default=None, max_length=1000)
    terms_summary: str | None = Field(default=None, max_length=1000)
    terms_url: str | None = Field(default=None, max_length=1000)
    image_key: str | None = Field(default=None, max_length=500, pattern=_IMAGE_KEY_PATTERN)
    media_asset_id: UUID | None = None
    audience_rules: AudienceRules = Field(default_factory=AudienceRules)
    priority: int = Field(default=0, ge=0, le=2_147_483_647)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    _redemption_url_is_safe = field_validator("redemption_url")(_validate_partner_url)
    _terms_url_is_safe = field_validator("terms_url")(_validate_partner_url)

    @field_validator("title")
    @classmethod
    def _title_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Campaign title cannot be blank.")
        return value

    @model_validator(mode="after")
    def _check_percentage_bounds(self) -> OfferCreate:
        if self.discount_type == "percentage" and self.discount_value > 100:
            raise ValueError("discount_value cannot exceed 100 for a percentage offer.")
        if not audience_rules_valid_for_offer(self.audience_rules):
            raise ValueError("Choose at least one dashboard audience role.")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at.")
        return self


class OfferUpdate(BaseModel):
    expected_version: int | None = Field(default=None, ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    discount_type: str | None = Field(default=None, pattern="^(percentage|flat|cashback-tie)$")
    discount_value: Decimal | None = Field(default=None, ge=0)
    code: str | None = Field(default=None, max_length=100)
    partner_name: str | None = Field(default=None, max_length=200)
    redemption_url: str | None = Field(default=None, max_length=1000)
    terms_summary: str | None = Field(default=None, max_length=1000)
    terms_url: str | None = Field(default=None, max_length=1000)
    image_key: str | None = Field(default=None, max_length=500, pattern=_IMAGE_KEY_PATTERN)
    media_asset_id: UUID | None = None
    audience_rules: AudienceRules | None = None
    priority: int | None = Field(default=None, ge=0, le=2_147_483_647)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    _redemption_url_is_safe = field_validator("redemption_url")(_validate_partner_url)
    _terms_url_is_safe = field_validator("terms_url")(_validate_partner_url)

    @field_validator("title")
    @classmethod
    def _updated_title_is_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Campaign title cannot be blank.")
        return value

    @field_validator(
        "title",
        "discount_type",
        "discount_value",
        "audience_rules",
        "priority",
        mode="before",
    )
    @classmethod
    def _required_fields_cannot_be_cleared(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be null.")
        return value

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
    partner_name: str | None
    redemption_url: str | None
    terms_summary: str | None
    terms_url: str | None
    image_key: str | None
    media_asset_id: UUID | None
    image_url: str | None = None
    audience_rules: AudienceRules
    priority: int
    status: OfferStatus
    created_by_uuid: UUID
    review_note: str | None
    reviewed_by_uuid: UUID | None
    reviewed_at: datetime | None
    version: int
    removed_by_uuid: UUID | None
    removal_reason: str | None
    removed_at: datetime | None
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime
    updated_at: datetime


class OfferListResponse(BaseModel):
    offers: list[OfferRead]


class OfferRejectRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)

    @field_validator("note")
    @classmethod
    def _note_is_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A review or removal reason is required.")
        return value


class OfferImageUploadRequest(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    filename: str = Field(min_length=1, max_length=200)


class OfferImageUploadResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int
