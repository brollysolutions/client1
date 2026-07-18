"""Client-facing loan application read schemas (GET /api/v1/loans/applications*).

Read-only for now: no create/update endpoint exists yet (no staff/telecaller
workflow to open or advance a loan_applications row). loan_type is flattened
from the relationship so callers never see the raw loan_type_id FK.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

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
