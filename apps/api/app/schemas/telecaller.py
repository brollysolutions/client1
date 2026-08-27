"""Telecaller lead-follow-up schemas (list/detail, status update, call log, home)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.financial_products import FormAnswers, ProductFormDefinition

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
PropertyDealStatusLiteral = Literal[
    "new",
    "contacted",
    "site_visit_done",
    "negotiation",
    "booked",
    "agreement_signed",
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
    model_config = ConfigDict(extra="forbid")

    status: TelecallerLeadStatusLiteral | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> TelecallerLeadUpdate:
        if self.status is None:
            raise ValueError("Provide status; qualification details belong in call activities.")
        return self


class TelecallerLeadRead(BaseModel):
    id: UUID
    name: str | None = None
    mobile: str
    business_line: Literal["loans", "real_estate"]
    status: LeadStatusLiteral
    requirement: dict[str, Any] | None = None
    last_disposition: CallDispositionLiteral | None = None
    next_follow_up_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class LoanTxnCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bank_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    amount: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
    interest_rate: Annotated[Decimal, Field(ge=0, le=100, max_digits=6, decimal_places=3)]
    txn_date: date


class LoanTxnRead(BaseModel):
    id: UUID
    loan_application_uuid: UUID
    bank_name: str | None = None
    amount: Decimal | None = None
    interest_rate: Decimal | None = None
    txn_date: date | None = None
    created_at: datetime


class TelecallerLoanApplicationRead(BaseModel):
    id: UUID
    loan_type_id: UUID
    loan_type_name: str
    bank_id: UUID | None = None
    bank_name: str | None = None
    amount_requested: Decimal | None = None
    amount_sanctioned: Decimal | None = None
    interest_rate: Decimal | None = None
    processing_fee: Decimal | None = None
    fee_outcome: Literal["waived", "cashback", "none"] | None = None
    status: LoanStatusLiteral
    status_reason: str | None = None
    closed_at: datetime | None = None
    txns: list[LoanTxnRead]
    form_version: int | None = None
    form_schema_snapshot: ProductFormDefinition | None = None
    form_answers: FormAnswers | None = None


class PropertyDealCreate(BaseModel):
    property_id: UUID


class TelecallerPropertyDealRead(BaseModel):
    id: UUID
    property_title: str
    property_location: str
    price_quoted: Decimal | None = None
    booking_amount: Decimal | None = None
    status: PropertyDealStatusLiteral
    status_reason: str | None = None
    site_visit_uuid: UUID | None
    closed_at: datetime | None


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    due_at: datetime | None = None

    @model_validator(mode="after")
    def _due_at_in_future(self) -> TaskCreate:
        if self.due_at is not None:
            due_at = self.due_at
            if due_at.tzinfo is None:
                due_at = due_at.replace(tzinfo=UTC)
            if due_at <= datetime.now(UTC):
                raise ValueError("due_at must be in the future.")
        return self


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
    property_deals: list[TelecallerPropertyDealRead] = []
    tasks: list[TaskRead] = []


class TelecallerFollowUpItem(BaseModel):
    lead_uuid: UUID
    name: str | None = None
    mobile: str
    follow_up_at: datetime


class TelecallerHomeResponse(BaseModel):
    follow_ups_due: list[TelecallerFollowUpItem]
    counts_by_status: dict[str, int]
