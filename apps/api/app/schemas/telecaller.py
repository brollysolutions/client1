"""Telecaller lead-follow-up schemas (list/detail, status update, call log, home)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

LeadStatusLiteral = Literal["new", "assigned", "working", "converted", "closed", "released"]
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


class TelecallerLeadDetailRead(TelecallerLeadRead):
    activities: list[LeadActivityRead]


class TelecallerFollowUpItem(BaseModel):
    lead_uuid: UUID
    name: str | None
    mobile: str
    follow_up_at: datetime


class TelecallerHomeResponse(BaseModel):
    follow_ups_due: list[TelecallerFollowUpItem]
    counts_by_status: dict[str, int]
