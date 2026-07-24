"""Client-facing loan schemas (/api/v1/loans/*).

loan_type is flattened from the relationship so callers never see the raw
loan_type_id FK. LoanApplicationCreate is the one client-writable shape: the
client picks a loan type + amount only — lead_uuid, client_profile_uuid,
business_line, and status are all stamped server-side (see api/v1/loans.py).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.loan import FeeOutcome, LoanStatus


class LoanTypeSummary(BaseModel):
    id: UUID
    label: str


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


class LoanApplicationListResponse(BaseModel):
    applications: list[LoanApplicationRead]


class LoanApplicationCreate(BaseModel):
    loan_type_id: UUID
    amount_requested: Annotated[Decimal, Field(gt=0, le=Decimal("999999999999.99"))]


class LoanTypeRead(BaseModel):
    id: UUID
    label: str


class LoanTypeListResponse(BaseModel):
    loan_types: list[LoanTypeRead]


class BankRead(BaseModel):
    id: UUID
    name: str


class BankListResponse(BaseModel):
    banks: list[BankRead]


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
