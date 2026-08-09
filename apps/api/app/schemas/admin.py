"""Admin provisioning schemas — staff create + agent-application approval queue."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
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
    # and employee are line-scoped (loans, real_estate, or both is required).
    business_line: Literal["loans", "real_estate", "both"] | None = None

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
                raise ValueError("A business_line is required for this role.")
        return self


class StaffCreateResponse(BaseModel):
    first_name: str
    last_name: str
    mobile: str
    role: StaffRoleLiteral
    business_line: Literal["loans", "real_estate", "both"] | None
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
    email: str | None  # additive: rows predating migration c1d2e3f4a5b6 have none
    business_line: Literal["loans", "real_estate"]
    rera_code: str | None
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime


class AgentApplicationListResponse(BaseModel):
    applications: list[AgentApplicationRead]


AgentDocumentTypeLiteral = Literal["aadhaar_front", "aadhaar_back", "pan", "photo"]


class AgentApplicationDocument(BaseModel):
    doc_type: AgentDocumentTypeLiteral
    # 5-minute presigned GET, minted fresh per request — never persisted, so a
    # stale copy of this response can't leak a working download link later.
    download_url: str


class AgentApplicationDetailRead(AgentApplicationRead):
    documents: list[AgentApplicationDocument]
    # Staff-only reviewer context, only ever set on reject — never surfaced
    # on the applicant-facing side of this table.
    review_note: str | None = None


class AgentApproveResponse(BaseModel):
    agent_code: str
    business_line: Literal["loans", "real_estate"]
    temp_password: str | None  # None when reusing an already-credentialed account


class AgentRejectRequest(BaseModel):
    note: Annotated[str, Field(min_length=1, max_length=1000)]


class AdminAccountDeleteRequest(BaseModel):
    """FR-17.4 — Admin removal of a suspicious account. Unlike AgentRejectRequest.note
    above, this reason IS persisted (AuthEvent.detail.reason)."""

    reason: Annotated[str, Field(min_length=1, max_length=1000)]


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


class AdminLeadRead(BaseModel):
    id: UUID
    name: str | None
    mobile: str
    business_line: Literal["loans", "real_estate"]
    origin: Literal["direct", "agent"]
    created_at: datetime


class LeadReleaseRequest(BaseModel):
    # None = release to queue (status becomes "released"). Set = release + assign
    # to this telecaller in one step (status becomes "assigned"), no intermediate
    # unassigned window.
    telecaller_staff_profile_uuid: UUID | None = None
    release_reason: Annotated[str, Field(max_length=1000)] | None = None


class LeadReleaseResponse(BaseModel):
    lead_id: UUID
    business_line: Literal["loans", "real_estate"]
    # Only two outcomes are reachable from release_lead_from_telecaller.
    status: Literal["assigned", "released"]
    previous_telecaller_staff_profile_uuid: UUID | None
    telecaller_staff_profile_uuid: UUID | None
    released_at: datetime
    release_reason: str | None


class AdminAssignedLeadRead(BaseModel):
    id: UUID
    name: str | None
    mobile: str
    business_line: Literal["loans", "real_estate"]
    origin: Literal["direct", "agent"]
    status: Literal["assigned", "working"]
    assigned_telecaller_staff_profile_uuid: UUID | None
    assigned_telecaller_name: str | None
    assigned_telecaller_staff_code: str | None
    created_at: datetime
    updated_at: datetime


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


class AdminEmployeeRead(BaseModel):
    id: UUID
    staff_code: str
    business_line: Literal["loans", "real_estate", "both"]
    first_name: str
    last_name: str


# ---------------------------------------------------------------------------
# Loan applications (Loan Lifecycle Progression slice — platform-wide list +
# override, on top of the same shared progress-update endpoint telecallers use)
# ---------------------------------------------------------------------------

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


class AdminLoanApplicationRead(BaseModel):
    id: UUID
    lead_uuid: UUID
    customer_code: str
    loan_type_id: UUID
    loan_type_label: str
    bank_id: UUID | None
    bank_name: str | None
    business_line: Literal["loans", "real_estate"]
    status: LoanStatusLiteral
    status_reason: str | None
    amount_requested: Decimal | None
    amount_sanctioned: Decimal | None
    interest_rate: Decimal | None
    processing_fee: Decimal | None
    fee_outcome: Literal["waived", "cashback", "none"] | None
    opened_at: datetime
    closed_at: datetime | None


class AdminLoanApplicationListResponse(BaseModel):
    applications: list[AdminLoanApplicationRead]


# ---------------------------------------------------------------------------
# Property deals (Real Estate Deal Lifecycle Progression)
# ---------------------------------------------------------------------------

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


class AdminPropertyDealRead(BaseModel):
    id: UUID
    lead_uuid: UUID
    customer_code: str
    property_title: str
    business_line: Literal["loans", "real_estate"]
    status: PropertyDealStatusLiteral
    status_reason: str | None
    price_quoted: Decimal | None
    booking_amount: Decimal | None
    site_visit_uuid: UUID | None
    opened_at: datetime
    closed_at: datetime | None


class AdminPropertyDealListResponse(BaseModel):
    deals: list[AdminPropertyDealRead]


# ---------------------------------------------------------------------------
# Composed home (Admin Dashboard slice 1) — aggregates the cross-domain
# approval queue plus pipeline/queue counts into one payload, following the
# SubAdminHomeResponse convention. Not a shared schema with sub_admin's
# PendingApprovalItem: the two field shapes match today by coincidence, but
# sharing one OpenAPI component across two role contracts would let a Sub
# Admin rename silently break the Admin client.
# ---------------------------------------------------------------------------


class AdminPendingItem(BaseModel):
    """An agent application, banner, or property listing awaiting Admin review."""

    id: UUID
    kind: Literal["agent_application", "banner", "property_submission"]
    title: str
    business_line: str
    submitted_at: datetime


class AdminHomeResponse(BaseModel):
    # Merged, newest-first, capped at _PENDING_QUEUE_LIMIT. The three counts
    # below are UNCAPPED so the UI can render "showing N of total".
    pending_review: list[AdminPendingItem]

    pending_agent_applications_count: int
    pending_banners_count: int
    pending_property_submissions_count: int

    open_loan_applications_count: int
    open_property_deals_count: int

    unassigned_leads_count: int
    unassigned_tasks_count: int
    payouts_awaiting_approval_count: int
    referrals_awaiting_payout_count: int
