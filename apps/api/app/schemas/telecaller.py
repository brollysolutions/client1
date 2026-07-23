"""Telecaller lead-follow-up schemas (list/detail, status update, call log, home)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

LeadStatusLiteral = Literal["new", "assigned", "working", "converted", "closed", "released"]
LoanStatusLiteral = Literal[
    "new",
    "assigned",
    "contacted",
    "docs_collected",
    "submitted_to_bank",
    "sanctioned",
    "disbursed",
    "closed",
    "rejected",
    "on_hold",
]
TaskTypeLiteral = Literal["document_collection", "property_visit", "background_check"]
TaskStatusLiteral = Literal[
    "unassigned", "assigned", "in_progress", "completed", "cancelled", "blocked"
]
# A telecaller may only move a lead through these; new/assigned/released are
# system- or Admin-owned (design doc §4.1).
TelecallerLeadStatusLiteral = Literal["working", "converted", "closed"]
CallDispositionLiteral = Literal[
    "connected",
    "no_answer",
    "busy",
    "switched_off",
    "wrong_number",
    "callback_requested",
    "not_interested",
]
InterestLevelLiteral = Literal["hot", "warm", "cold"]


class LeadActivityCreate(BaseModel):
    disposition: CallDispositionLiteral
    interest_level: InterestLevelLiteral | None = None
    notes: Annotated[str | None, Field(default=None, max_length=1000)] = None
    follow_up_at: datetime | None = None

    @model_validator(mode="after")
    def _interest_level_matches_disposition(self) -> LeadActivityCreate:
        if self.disposition == "connected" and self.interest_level is None:
            raise ValueError("interest_level is required when disposition is 'connected'.")
        if self.disposition != "connected" and self.interest_level is not None:
            raise ValueError("interest_level is only set when disposition is 'connected'.")
        return self

    @model_validator(mode="after")
    def _follow_up_in_future(self) -> LeadActivityCreate:
        if self.follow_up_at is not None:
            now = datetime.now(UTC)
            follow_up = self.follow_up_at
            if follow_up.tzinfo is None:
                follow_up = follow_up.replace(tzinfo=UTC)
            if follow_up <= now:
                raise ValueError("follow_up_at must be in the future.")
        return self


class LeadActivityRead(BaseModel):
    id: UUID
    lead_uuid: UUID
    disposition: CallDispositionLiteral
    interest_level: InterestLevelLiteral | None
    notes: str | None
    follow_up_at: datetime | None
    created_at: datetime


class TelecallerLeadUpdate(BaseModel):
    status: TelecallerLeadStatusLiteral | None = None
    requirement: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> TelecallerLeadUpdate:
        if self.status is None and self.requirement is None:
            raise ValueError("Provide at least one of status or requirement.")
        return self


class TelecallerLeadRead(BaseModel):
    id: UUID
    name: str | None
    mobile: str
    business_line: Literal["loans", "real_estate"]
    status: LeadStatusLiteral
    requirement: dict[str, Any] | None
    last_disposition: CallDispositionLiteral | None = None
    next_follow_up_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class LoanTxnCreate(BaseModel):
    bank_name: Annotated[str | None, Field(default=None, max_length=200)] = None
    amount: Annotated[Decimal | None, Field(default=None, ge=0)] = None
    interest_rate: Annotated[Decimal | None, Field(default=None, ge=0, le=100)] = None
    txn_date: date | None = None


class LoanTxnRead(BaseModel):
    id: UUID
    loan_application_uuid: UUID
    bank_name: str | None
    amount: Decimal | None
    interest_rate: Decimal | None
    txn_date: date | None
    created_at: datetime


class TelecallerLoanApplicationRead(BaseModel):
    id: UUID
    loan_type_name: str
    bank_name: str | None
    amount_requested: Decimal | None
    status: LoanStatusLiteral
    txns: list[LoanTxnRead]


class TaskCreate(BaseModel):
    notes: Annotated[str | None, Field(default=None, max_length=1000)] = None
    due_at: datetime | None = None


class TaskRead(BaseModel):
    id: UUID
    lead_uuid: UUID
    task_type: TaskTypeLiteral
    status: TaskStatusLiteral
    notes: str | None
    due_at: datetime | None
    assigned_employee_profile_uuid: UUID | None
    created_at: datetime


class TelecallerLeadDetailRead(TelecallerLeadRead):
    activities: list[LeadActivityRead]
    loan_applications: list[TelecallerLoanApplicationRead] = []
    tasks: list[TaskRead] = []


class TelecallerFollowUpItem(BaseModel):
    lead_uuid: UUID
    name: str | None
    mobile: str
    follow_up_at: datetime


class TelecallerHomeResponse(BaseModel):
    follow_ups_due: list[TelecallerFollowUpItem]
    counts_by_status: dict[str, int]
