"""Admin router — staff provisioning + agent-application approval queue.

Every write runs on the request session under RLS; require_admin is the access
gate (see app/services/admin.py module docstring for why RLS alone isn't enough).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_admin
from app.db.session import get_db
from app.models.profile import AgentApplication, SubmissionStatus
from app.schemas.admin import (
    AdminLoanApplicationListResponse,
    AdminLoanApplicationRead,
    AdminPropertyDealListResponse,
    AdminPropertyDealRead,
    AdminTaskRead,
    AgentApplicationListResponse,
    AgentApplicationRead,
    AgentApproveResponse,
    AgentRejectRequest,
    LeadAssignRequest,
    LeadAssignResponse,
    StaffCreateRequest,
    StaffCreateResponse,
    TaskAssignRequest,
)
from app.schemas.loans import LoanApplicationProgressUpdate
from app.schemas.property_deals import PropertyDealProgressUpdate
from app.services.admin import (
    AgentApplicationAlreadyReviewed,
    StaffAlreadyExists,
    approve_agent_application,
    create_staff,
    reject_agent_application,
)
from app.services.leads import (
    InvalidTelecaller,
    LeadAlreadyAssigned,
    LeadHasNoBusinessLine,
    LeadNotFound,
    assign_lead_to_telecaller,
)
from app.services.loan_applications import InvalidStatusTransition as InvalidLoanStatusTransition
from app.services.loan_applications import (
    StatusReasonRequired,
    TerminalApplication,
    TermsNotAllowedAtStage,
    UnknownBank,
    apply_progress_update,
    get_application_for_admin,
    list_applications_for_admin,
)
from app.services.property_deals import InvalidStatusTransition as InvalidDealStatusTransition
from app.services.property_deals import (
    StatusReasonRequired as DealStatusReasonRequired,
)
from app.services.property_deals import (
    TerminalDeal,
    UnknownSiteVisit,
    get_deal_for_admin,
    list_deals_for_admin,
)
from app.services.property_deals import (
    TermsNotAllowedAtStage as DealTermsNotAllowedAtStage,
)
from app.services.property_deals import (
    apply_progress_update as apply_deal_progress_update,
)
from app.services.tasks import (
    InvalidEmployee,
    TaskNotAssignable,
    TaskNotFound,
    assign_task_to_employee,
    list_unassigned_tasks,
)

router = APIRouter()


def _to_admin_loan_application_read(application) -> AdminLoanApplicationRead:  # noqa: ANN001
    return AdminLoanApplicationRead(
        id=application.id,
        lead_uuid=application.lead_uuid,
        customer_code=application.client_profile.customer_code,
        loan_type_label=application.loan_type.label,
        bank_id=application.bank_id,
        bank_name=application.bank.name if application.bank else None,
        business_line=application.business_line,
        status=application.status,
        status_reason=application.status_reason,
        amount_requested=application.amount_requested,
        amount_sanctioned=application.amount_sanctioned,
        interest_rate=application.interest_rate,
        processing_fee=application.processing_fee,
        fee_outcome=application.fee_outcome,
        opened_at=application.opened_at,
        closed_at=application.closed_at,
    )


def _to_admin_property_deal_read(deal) -> AdminPropertyDealRead:  # noqa: ANN001
    return AdminPropertyDealRead(
        id=deal.id,
        lead_uuid=deal.lead_uuid,
        customer_code=deal.client_profile.customer_code,
        property_title=deal.property.title,
        business_line=deal.business_line,
        status=deal.status,
        status_reason=deal.status_reason,
        price_quoted=deal.price_quoted,
        booking_amount=deal.booking_amount,
        site_visit_uuid=deal.site_visit_uuid,
        opened_at=deal.opened_at,
        closed_at=deal.closed_at,
    )


@router.post(
    "/users/create", response_model=StaffCreateResponse, status_code=status.HTTP_201_CREATED
)
async def create_staff_user(
    payload: StaffCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> StaffCreateResponse:
    try:
        profile, temp_password = await create_staff(db, current_user.id, payload)
    except StaffAlreadyExists as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number already has an active staff account.",
        ) from exc
    return StaffCreateResponse(
        first_name=payload.first_name,
        last_name=payload.last_name,
        mobile=payload.mobile,
        role=payload.role,
        business_line=profile.business_line,
        staff_code=profile.staff_code,
        temp_password=temp_password,
    )


@router.get("/agents", response_model=AgentApplicationListResponse)
async def list_pending_agent_applications(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentApplicationListResponse:
    rows = (
        await db.scalars(
            select(AgentApplication)
            .where(AgentApplication.status == SubmissionStatus.PENDING)
            .order_by(AgentApplication.created_at.desc())
        )
    ).all()
    return AgentApplicationListResponse(
        applications=[AgentApplicationRead.model_validate(r, from_attributes=True) for r in rows]
    )


@router.post("/agents/{application_id}/approve", response_model=AgentApproveResponse)
async def approve_agent(
    application_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentApproveResponse:
    try:
        result = await approve_agent_application(
            db, application_id, current_user.staff_profile_uuid
        )
    except AgentApplicationAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This application has already been reviewed.",
        ) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    profile, temp_password = result
    return AgentApproveResponse(
        agent_code=profile.agent_code,
        business_line=profile.business_line,
        temp_password=temp_password,
    )


@router.post("/agents/{application_id}/reject", response_model=AgentApplicationRead)
async def reject_agent(
    application_id: UUID,
    payload: AgentRejectRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentApplicationRead:
    try:
        ok = await reject_agent_application(
            db, application_id, current_user.staff_profile_uuid, payload.note
        )
    except AgentApplicationAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This application has already been reviewed.",
        ) from exc
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    application = await db.scalar(
        select(AgentApplication).where(AgentApplication.id == application_id)
    )
    if application is None:  # pragma: no cover — admin RLS always sees the row it just rejected
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return AgentApplicationRead.model_validate(application, from_attributes=True)


@router.post("/leads/{lead_id}/assign", response_model=LeadAssignResponse)
async def assign_lead(
    lead_id: UUID,
    payload: LeadAssignRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LeadAssignResponse:
    try:
        lead = await assign_lead_to_telecaller(db, lead_id, payload.telecaller_staff_profile_uuid)
    except LeadNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.") from exc
    except LeadAlreadyAssigned as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This lead already has a telecaller assigned."
        ) from exc
    except LeadHasNoBusinessLine as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "This lead has no business line yet and cannot be assigned.",
        ) from exc
    except InvalidTelecaller as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Target account is not an active telecaller on this lead's business line.",
        ) from exc
    return LeadAssignResponse(
        lead_id=lead.id,
        telecaller_staff_profile_uuid=lead.assigned_telecaller_profile_uuid,
        business_line=lead.business_line,
        status=lead.status,
    )


@router.get("/tasks", response_model=list[AdminTaskRead])
async def list_tasks(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminTaskRead]:
    tasks = await list_unassigned_tasks(db, status_filter)
    return [AdminTaskRead.model_validate(t, from_attributes=True) for t in tasks]


@router.post("/tasks/{task_id}/assign", response_model=AdminTaskRead)
async def assign_task(
    task_id: UUID,
    payload: TaskAssignRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminTaskRead:
    try:
        task = await assign_task_to_employee(db, task_id, payload.employee_profile_uuid)
    except TaskNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.") from exc
    except TaskNotAssignable as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This task is not in an unassigned state."
        ) from exc
    except InvalidEmployee as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Target account is not an active employee on this task's business line.",
        ) from exc
    return AdminTaskRead.model_validate(task, from_attributes=True)


@router.get("/loans", response_model=AdminLoanApplicationListResponse)
async def list_loan_applications(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(require_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminLoanApplicationListResponse:
    applications = await list_applications_for_admin(db, status_filter)
    return AdminLoanApplicationListResponse(
        applications=[_to_admin_loan_application_read(a) for a in applications]
    )


@router.patch("/loan-applications/{application_id}", response_model=AdminLoanApplicationRead)
async def update_loan_application_progress(
    application_id: UUID,
    payload: LoanApplicationProgressUpdate,
    current_user: CurrentUser = Depends(require_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminLoanApplicationRead:
    application = await get_application_for_admin(db, application_id)
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan application not found.")

    try:
        application = await apply_progress_update(db, application, payload)
    except TerminalApplication as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This application is already closed."
        ) from exc
    except InvalidLoanStatusTransition as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That status change is not allowed from the current status."
        ) from exc
    except StatusReasonRequired as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A reason is required when moving to rejected or on hold.",
        ) from exc
    except TermsNotAllowedAtStage as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Deal terms can only be set once the application has been submitted to a bank.",
        ) from exc
    except UnknownBank as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown or inactive bank."
        ) from exc

    application = await get_application_for_admin(db, application_id)
    assert application is not None  # just updated it above
    return _to_admin_loan_application_read(application)


@router.get("/property-deals", response_model=AdminPropertyDealListResponse)
async def list_property_deals(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(require_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminPropertyDealListResponse:
    deals = await list_deals_for_admin(db, status_filter)
    return AdminPropertyDealListResponse(deals=[_to_admin_property_deal_read(d) for d in deals])


@router.patch("/property-deals/{deal_id}", response_model=AdminPropertyDealRead)
async def update_property_deal_progress(
    deal_id: UUID,
    payload: PropertyDealProgressUpdate,
    current_user: CurrentUser = Depends(require_admin),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminPropertyDealRead:
    deal = await get_deal_for_admin(db, deal_id)
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property deal not found.")

    try:
        deal = await apply_deal_progress_update(db, deal, payload)
    except TerminalDeal as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "This deal is already closed.") from exc
    except InvalidDealStatusTransition as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That status change is not allowed from the current status."
        ) from exc
    except DealStatusReasonRequired as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A reason is required when moving to rejected or on hold.",
        ) from exc
    except DealTermsNotAllowedAtStage as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Deal terms can only be set once the deal has been booked.",
        ) from exc
    except UnknownSiteVisit as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown site visit for this client."
        ) from exc

    deal = await get_deal_for_admin(db, deal_id)
    assert deal is not None  # just updated it above
    return _to_admin_property_deal_read(deal)
