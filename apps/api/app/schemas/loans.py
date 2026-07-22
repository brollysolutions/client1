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

from pydantic import BaseModel, Field

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
