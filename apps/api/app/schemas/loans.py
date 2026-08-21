"""Client-facing loan schemas (/api/v1/loans/*).

Loan/product relationships are exposed as typed summaries rather than raw
foreign keys. Clients submit a published form version and dynamic answers;
identity, lead, business-line, workflow status, and canonical loan amount are
resolved or stamped server-side (see api/v1/loans.py).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.loan import FeeOutcome, LoanStatus
from app.schemas.financial_products import FormAnswers, ProductCategory, ProductFormDefinition


class LoanTypeSummary(BaseModel):
    id: UUID
    label: str
    category: ProductCategory


class LoanApplicationRead(BaseModel):
    id: UUID
    loan_type: LoanTypeSummary
    status: LoanStatus
    status_reason: str | None
    amount_requested: Decimal | None
    amount_sanctioned: Decimal | None
    interest_rate: Decimal | None
    processing_fee: Decimal | None
    fee_outcome: FeeOutcome | None
    opened_at: datetime
    closed_at: datetime | None
    form_version: int | None
    form_schema_snapshot: ProductFormDefinition | None
    form_answers: FormAnswers | None


class LoanApplicationListResponse(BaseModel):
    applications: list[LoanApplicationRead]


class LoanApplicationCreate(BaseModel):
    loan_type_id: UUID
    form_version: Annotated[int, Field(ge=1)]
    answers: FormAnswers


class LoanTypeRead(BaseModel):
    id: UUID
    name: str
    label: str
    category: ProductCategory
    display_order: int
    form_version: int
    form_schema: ProductFormDefinition


class LoanTypeListResponse(BaseModel):
    loan_types: list[LoanTypeRead]


class FinancialServiceEnquiryCreate(BaseModel):
    product_id: UUID
    form_version: Annotated[int, Field(ge=1)]
    answers: FormAnswers


class FinancialServiceEnquiryRead(BaseModel):
    id: UUID
    product: LoanTypeSummary
    status: str
    form_version: int
    form_schema_snapshot: ProductFormDefinition
    form_answers: FormAnswers | None
    submitted_at: datetime


class FinancialServiceEnquiryListResponse(BaseModel):
    enquiries: list[FinancialServiceEnquiryRead]


class BankRead(BaseModel):
    id: UUID
    name: str


class BankListResponse(BaseModel):
    banks: list[BankRead]


class LoanOfficerContactRead(BaseModel):
    """Name + staff_code only -- never phone/email. Contact routes through
    the support-ticket flow (POST /api/v1/support-tickets/tickets)."""

    name: str
    staff_code: str


class LoanApplicationProgressUpdate(BaseModel):
    """Shared write shape for the Telecaller and Admin progression endpoints.

    Shape-only validation here (types/ranges); the transition/reason/terms-
    gating rules depend on the application's CURRENT status, so they live in
    services.loan_applications where that status is known.
    """

    status: LoanStatus | None = None
    status_reason: Annotated[str | None, Field(default=None, max_length=1000)] = None
    amount_sanctioned: Annotated[Decimal | None, Field(default=None, gt=0)] = None
    bank_id: UUID | None = None
    interest_rate: Annotated[Decimal | None, Field(default=None, ge=0, le=100)] = None
    processing_fee: Annotated[Decimal | None, Field(default=None, ge=0)] = None
    fee_outcome: FeeOutcome | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> LoanApplicationProgressUpdate:
        if all(
            v is None
            for v in (
                self.status,
                self.status_reason,
                self.amount_sanctioned,
                self.bank_id,
                self.interest_rate,
                self.processing_fee,
                self.fee_outcome,
            )
        ):
            raise ValueError("Provide at least one field to update.")
        return self
