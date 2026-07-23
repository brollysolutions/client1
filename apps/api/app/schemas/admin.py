"""Admin provisioning schemas — staff create + agent-application approval queue."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Staff provisioning
# ---------------------------------------------------------------------------

StaffRoleLiteral = Literal["sub_admin", "telecaller", "employee"]


class StaffCreateRequest(BaseModel):
    first_name: Annotated[str, Field(min_length=1, max_length=100)]
    last_name: Annotated[str, Field(min_length=1, max_length=100)]
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    email: EmailStr
    role: StaffRoleLiteral
    # sub_admin is platform-scoped (business_line must be omitted/null); telecaller
    # and employee are line-scoped (a single loans/real_estate line is required).
    business_line: Literal["loans", "real_estate"] | None = None

    @field_validator("email")
    @classmethod
    def email_normalize(cls, v: str) -> str:
        return v.strip().lower()

    @model_validator(mode="after")
    def check_business_line_matches_role(self) -> StaffCreateRequest:
        if self.role == "sub_admin":
            if self.business_line is not None:
                raise ValueError("Sub Admin is platform-scoped; do not provide a business_line.")
        else:
            if self.business_line is None:
                raise ValueError("A single business_line is required for this role.")
        return self


class StaffCreateResponse(BaseModel):
    first_name: str
    last_name: str
    mobile: str
    role: StaffRoleLiteral
    business_line: Literal["loans", "real_estate"] | None
    staff_code: str
    # Shown once, never persisted/logged. None when attaching a staff role to an
    # account that already had a working password (their credentials are unchanged).
    temp_password: str | None


# ---------------------------------------------------------------------------
# Agent application approval queue
# ---------------------------------------------------------------------------


class AgentApplicationRead(BaseModel):
    id: UUID
    first_name: str | None
    last_name: str | None
    mobile: str | None
    business_line: Literal["loans", "real_estate"]
    rera_code: str | None
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime


class AgentApplicationListResponse(BaseModel):
    applications: list[AgentApplicationRead]


class AgentApproveResponse(BaseModel):
    agent_code: str
    business_line: Literal["loans", "real_estate"]
    temp_password: str | None  # None when reusing an already-credentialed account


class AgentRejectRequest(BaseModel):
    # Accepted for reviewer context but NOT persisted this slice — agent_applications
    # has no review_note column; adding one needs a migration (see plan risks).
    note: Annotated[str, Field(min_length=1, max_length=1000)]


# ---------------------------------------------------------------------------
# Lead assignment (Telecaller Dashboard slice 1 — minimal, no admin queue UI yet)
# ---------------------------------------------------------------------------


class LeadAssignRequest(BaseModel):
    telecaller_staff_profile_uuid: UUID


class LeadAssignResponse(BaseModel):
    lead_id: UUID
    telecaller_staff_profile_uuid: UUID
    business_line: Literal["loans", "real_estate"]
    status: Literal["new", "assigned", "working", "converted", "closed", "released"]


# ---------------------------------------------------------------------------
# Field tasks (Telecaller Dashboard slice 2 — unassigned pool, minimal admin
# endpoints only, no queue UI yet)
# ---------------------------------------------------------------------------

TaskStatusLiteral = Literal[
    "unassigned", "assigned", "in_progress", "completed", "cancelled", "blocked"
]


class AdminTaskRead(BaseModel):
    id: UUID
    lead_uuid: UUID
    raised_by_staff_profile_uuid: UUID
    assigned_employee_profile_uuid: UUID | None
    business_line: Literal["loans", "real_estate"]
    task_type: Literal["document_collection", "property_visit", "background_check"]
    status: TaskStatusLiteral
    outcome: Literal["clear", "flagged", "inconclusive"] | None
    notes: str | None
    due_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskAssignRequest(BaseModel):
    employee_profile_uuid: UUID
