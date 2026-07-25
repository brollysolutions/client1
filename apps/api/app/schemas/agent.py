"""Agent home + lead-introduction/tracking schemas (Agent Dashboard slice 1)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

LeadStatusLiteral = Literal["new", "assigned", "working", "converted", "closed", "released"]
AgentProfileStatusLiteral = Literal["active", "inactive", "pending", "suspended"]


class AgentProfileStatusRead(BaseModel):
    agent_code: str
    business_line: Literal["loans", "real_estate"]
    kyc_status: str | None
    status: AgentProfileStatusLiteral
    rera_code: str | None
    approved_at: datetime | None


class AgentHomeResponse(BaseModel):
    profile: AgentProfileStatusRead
    counts_by_status: dict[str, int]


class AgentLeadCreate(BaseModel):
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    name: Annotated[str | None, Field(default=None, max_length=100)] = None
    requirement: dict[str, Any] | None = None


class AgentLeadUpdate(BaseModel):
    name: Annotated[str | None, Field(default=None, max_length=100)] = None
    requirement: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> AgentLeadUpdate:
        if self.name is None and self.requirement is None:
            raise ValueError("Provide at least one of name or requirement.")
        return self


class AgentLeadRead(BaseModel):
    id: UUID
    name: str | None
    mobile: str
    business_line: Literal["loans", "real_estate"] | None
    status: LeadStatusLiteral
    requirement: dict[str, Any] | None
    registered: bool
    editable: bool
    created_at: datetime
    updated_at: datetime
