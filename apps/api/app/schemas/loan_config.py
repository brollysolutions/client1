"""Admin financial-product, lender, and availability request contracts.

The API remains the source of truth for the allowlisted form-builder shape.
Products are deactivated rather than deleted so historical submissions retain
their catalogue references and immutable form snapshots.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.financial_catalog import ProviderType, PublicFaqItem, PublicTextList
from app.schemas.financial_products import (
    ProductCategory,
    ProductFormDefinition,
    ensure_category_form,
)


class AdminLoanTypeRead(BaseModel):
    id: UUID
    name: str
    label: str
    active: bool
    category: ProductCategory
    display_order: int
    form_version: int
    form_schema: ProductFormDefinition
    public_visible: bool
    public_summary: str | None
    public_description: str | None
    public_highlights: list[str]
    public_eligibility: list[str]
    public_documents: list[str]
    public_faq: list[PublicFaqItem]
    homepage_featured: bool
    homepage_feature_order: int
    created_at: datetime
    updated_at: datetime
    application_count: int
    enquiry_count: int


class AdminLoanTypeListResponse(BaseModel):
    loan_types: list[AdminLoanTypeRead]


class LoanTypeCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    category: ProductCategory = ProductCategory.LOAN
    display_order: Annotated[int, Field(ge=0, le=10000)] = 1000
    form_schema: ProductFormDefinition | None = None

    @field_validator("label")
    @classmethod
    def _normalize_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Product name cannot be blank.")
        return value

    @model_validator(mode="after")
    def _category_form_matches(self) -> LoanTypeCreate:
        if self.form_schema is not None:
            ensure_category_form(self.category, self.form_schema)
        return self


class LoanTypeUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=200)
    active: bool | None = None
    display_order: Annotated[int | None, Field(default=None, ge=0, le=10000)] = None
    form_schema: ProductFormDefinition | None = None
    public_visible: bool | None = None
    public_summary: str | None = Field(default=None, max_length=280)
    public_description: str | None = Field(default=None, max_length=4000)
    public_highlights: PublicTextList | None = None
    public_eligibility: PublicTextList | None = None
    public_documents: PublicTextList | None = None
    public_faq: Annotated[list[PublicFaqItem] | None, Field(default=None, max_length=10)] = None
    homepage_featured: bool | None = None
    homepage_feature_order: Annotated[int | None, Field(default=None, ge=0, le=10000)] = None

    @field_validator("label")
    @classmethod
    def _normalize_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Product name cannot be blank.")
        return value

    @model_validator(mode="after")
    def _at_least_one_field(self) -> LoanTypeUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        return self


class AdminBankRead(BaseModel):
    id: UUID
    name: str
    legal_name: str | None
    provider_type: ProviderType
    logo_key: str | None
    logo_url: str | None
    logo_source: str | None
    logo_verified_at: datetime | None
    active: bool
    created_at: datetime
    updated_at: datetime
    application_count: int
    offer_count: int


class AdminBankListResponse(BaseModel):
    banks: list[AdminBankRead]


class BankCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    legal_name: str | None = Field(default=None, max_length=200)
    provider_type: ProviderType = ProviderType.BANK
    logo_key: str | None = Field(default=None, max_length=500)
    logo_source: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Provider name cannot be blank.")
        return normalized

    @model_validator(mode="after")
    def _logo_has_provenance(self) -> BankCreate:
        if self.logo_key is not None and not (self.logo_source and self.logo_source.strip()):
            raise ValueError("A reviewed logo key requires its official or licensed source.")
        if self.logo_key is None and self.logo_source is not None:
            raise ValueError("A logo source requires a logo key.")
        return self


class BankUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    legal_name: str | None = Field(default=None, max_length=200)
    provider_type: ProviderType | None = None
    logo_key: str | None = Field(default=None, max_length=500)
    logo_source: str | None = Field(default=None, max_length=500)
    active: bool | None = None

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Provider name cannot be blank.")
        return normalized

    @model_validator(mode="after")
    def _at_least_one_field(self) -> BankUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        if (
            "logo_key" in self.model_fields_set
            and self.logo_key is not None
            and (
                "logo_source" not in self.model_fields_set
                or not (self.logo_source and self.logo_source.strip())
            )
        ):
            raise ValueError("A reviewed logo key requires its official or licensed source.")
        return self


class BankAvailabilityEntry(BaseModel):
    bank_id: UUID
    loan_type_id: UUID
    available: bool


class BankAvailabilityMatrixResponse(BaseModel):
    """The full picture the admin console renders as a grid: every loan type
    (columns) x every bank (rows), plus the sparse set of explicit overrides.
    A (bank_id, loan_type_id) pair absent from `entries` is available — see the
    module docstring on `services/loan_config.py`."""

    banks: list[AdminBankRead]
    loan_types: list[AdminLoanTypeRead]
    entries: list[BankAvailabilityEntry]


class BankAvailabilitySetEntry(BaseModel):
    loan_type_id: UUID
    available: bool


class BankAvailabilitySet(BaseModel):
    """PUT body for one bank's availability overrides.

    This is an UPSERT, not a full-replace: `services/loan_config.py::
    set_bank_availability` writes exactly the rows submitted here and never
    deletes a row omitted from `entries` (the table's grant has no DELETE, by
    design — migration 678f7a77e812). An omitted loan_type_id keeps whatever
    it already was, not the permissive default. The admin console's checkbox
    grid always submits every current loan type on every save, so in
    practice a save behaves like a full-replace — but that is a UI
    convention, not something this endpoint enforces.
    """

    entries: Annotated[list[BankAvailabilitySetEntry], Field(max_length=500)]

    @model_validator(mode="after")
    def _no_duplicate_loan_types(self) -> BankAvailabilitySet:
        seen = {e.loan_type_id for e in self.entries}
        if len(seen) != len(self.entries):
            raise ValueError("entries must not repeat the same loan_type_id.")
        return self
