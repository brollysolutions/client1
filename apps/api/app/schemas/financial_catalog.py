"""Closed contracts for public Financial Services and Admin provider offers."""

from __future__ import annotations

import enum
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.financial_products import ProductCategory


class ProviderType(enum.StrEnum):
    BANK = "bank"
    SMALL_FINANCE_BANK = "small_finance_bank"
    NBFC = "nbfc"
    HFC = "hfc"
    FINTECH = "fintech"
    OTHER = "other"


class PublicFaqItem(BaseModel):
    question: str = Field(min_length=3, max_length=180)
    answer: str = Field(min_length=3, max_length=800)

    @field_validator("question", "answer")
    @classmethod
    def _trim(cls, value: str) -> str:
        return value.strip()


PublicTextList = Annotated[
    list[Annotated[str, Field(min_length=2, max_length=180)]], Field(max_length=12)
]


class FinancialProductMarketingFields(BaseModel):
    public_visible: bool = False
    public_summary: str | None = Field(default=None, max_length=280)
    public_description: str | None = Field(default=None, max_length=4000)
    public_highlights: PublicTextList = []
    public_eligibility: PublicTextList = []
    public_documents: PublicTextList = []
    public_faq: Annotated[list[PublicFaqItem], Field(max_length=10)] = []
    homepage_featured: bool = False
    homepage_feature_order: Annotated[int, Field(ge=0, le=10000)] = 1000

    @field_validator(
        "public_summary",
        "public_description",
        mode="before",
    )
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("public_highlights", "public_eligibility", "public_documents")
    @classmethod
    def _normalize_list(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if len({value.casefold() for value in normalized}) != len(normalized):
            raise ValueError("List items must be unique.")
        return normalized

    @model_validator(mode="after")
    def _publication_is_complete(self) -> FinancialProductMarketingFields:
        if self.homepage_featured and not self.public_visible:
            raise ValueError("A homepage-featured product must be public.")
        if self.public_visible and (not self.public_summary or not self.public_description):
            raise ValueError("Public products require a summary and description.")
        return self


class PublicFinancialProductRead(BaseModel):
    id: UUID
    slug: str
    label: str
    category: ProductCategory
    summary: str
    description: str
    highlights: list[str]
    eligibility: list[str]
    documents: list[str]
    faq: list[PublicFaqItem]
    homepage_featured: bool
    provider_count: int
    updated_at: datetime


class PublicFinancialProductListResponse(BaseModel):
    items: list[PublicFinancialProductRead]
    total: int
    page: int
    page_size: int


class PublicProviderRead(BaseModel):
    id: UUID
    name: str
    legal_name: str | None
    provider_type: ProviderType
    logo_url: str | None


class PublicProviderOfferRead(BaseModel):
    id: UUID
    offer_name: str
    summary: str | None
    provider: PublicProviderRead
    min_amount: Decimal | None
    max_amount: Decimal | None
    min_interest_rate: Decimal | None
    max_interest_rate: Decimal | None
    min_tenure_months: int | None
    max_tenure_months: int | None
    processing_fee_text: str | None
    eligibility_summary: str | None
    last_verified_at: datetime | None


class PublicProviderOfferListResponse(BaseModel):
    items: list[PublicProviderOfferRead]
    total: int
    page: int
    page_size: int


class ProviderOfferCreate(BaseModel):
    loan_type_id: UUID
    bank_id: UUID
    offer_name: str = Field(min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=500)
    published: bool = False
    display_order: Annotated[int, Field(ge=0, le=10000)] = 1000
    min_amount: Annotated[
        Decimal | None, Field(default=None, ge=0, max_digits=14, decimal_places=2)
    ]
    max_amount: Annotated[
        Decimal | None, Field(default=None, ge=0, max_digits=14, decimal_places=2)
    ]
    min_interest_rate: Annotated[
        Decimal | None, Field(default=None, ge=0, le=100, max_digits=6, decimal_places=3)
    ]
    max_interest_rate: Annotated[
        Decimal | None, Field(default=None, ge=0, le=100, max_digits=6, decimal_places=3)
    ]
    min_tenure_months: Annotated[int | None, Field(default=None, ge=1, le=600)]
    max_tenure_months: Annotated[int | None, Field(default=None, ge=1, le=600)]
    processing_fee_text: str | None = Field(default=None, max_length=240)
    eligibility_summary: str | None = Field(default=None, max_length=500)
    last_verified_at: datetime | None = None

    @field_validator("offer_name", "summary", "processing_fee_text", "eligibility_summary")
    @classmethod
    def _trim_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def _ranges_are_ordered(self) -> ProviderOfferCreate:
        for low, high, label in (
            (self.min_amount, self.max_amount, "amount"),
            (self.min_interest_rate, self.max_interest_rate, "interest rate"),
            (self.min_tenure_months, self.max_tenure_months, "tenure"),
        ):
            if low is not None and high is not None and high < low:
                raise ValueError(f"Maximum {label} cannot be below minimum {label}.")
        if self.published and self.last_verified_at is None:
            raise ValueError("Published offers require a verification date.")
        if self.last_verified_at is not None:
            if self.last_verified_at.tzinfo is None or self.last_verified_at.utcoffset() is None:
                raise ValueError("Verification time must include a timezone.")
            if self.last_verified_at > datetime.now(UTC):
                raise ValueError("Verification time cannot be in the future.")
        return self


class ProviderOfferUpdate(BaseModel):
    offer_name: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=500)
    published: bool | None = None
    display_order: Annotated[int | None, Field(default=None, ge=0, le=10000)] = None
    min_amount: Annotated[
        Decimal | None, Field(default=None, ge=0, max_digits=14, decimal_places=2)
    ] = None
    max_amount: Annotated[
        Decimal | None, Field(default=None, ge=0, max_digits=14, decimal_places=2)
    ] = None
    min_interest_rate: Annotated[
        Decimal | None, Field(default=None, ge=0, le=100, max_digits=6, decimal_places=3)
    ] = None
    max_interest_rate: Annotated[
        Decimal | None, Field(default=None, ge=0, le=100, max_digits=6, decimal_places=3)
    ] = None
    min_tenure_months: Annotated[int | None, Field(default=None, ge=1, le=600)] = None
    max_tenure_months: Annotated[int | None, Field(default=None, ge=1, le=600)] = None
    processing_fee_text: str | None = Field(default=None, max_length=240)
    eligibility_summary: str | None = Field(default=None, max_length=500)
    last_verified_at: datetime | None = None

    @model_validator(mode="after")
    def _has_change(self) -> ProviderOfferUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        return self


class AdminProviderOfferRead(ProviderOfferCreate):
    id: UUID
    product_label: str
    provider_name: str
    created_at: datetime
    updated_at: datetime


class AdminProviderOfferListResponse(BaseModel):
    offers: list[AdminProviderOfferRead]


LogoContentType = Literal["image/jpeg", "image/png", "image/webp"]


class ProviderLogoUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    content_type: LogoContentType


class ProviderLogoUploadResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class ProviderLogoConfirmRequest(BaseModel):
    object_key: str = Field(min_length=1, max_length=500)
    content_type: LogoContentType
    source_reference: str = Field(min_length=3, max_length=500)


ProviderOfferSort = Literal["recommended", "interest_rate", "amount", "updated"]
