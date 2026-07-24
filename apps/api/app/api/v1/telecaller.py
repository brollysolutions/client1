"""Telecaller router — assigned-lead list/detail, status update, call log, home.

Every route depends on require_telecaller (app-layer gate) on top of the
leads_rls / lead_activities_rls own-assignment RLS predicates (defense in depth,
same posture as every other role-gated router in this codebase).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_telecaller
from app.db.session import get_db
from app.schemas.loans import LoanApplicationProgressUpdate
from app.schemas.telecaller import (
    LeadActivityCreate,
    LeadActivityRead,
    LoanTxnCreate,
    LoanTxnRead,
    TaskCreate,
    TaskRead,
    TelecallerFollowUpItem,
    TelecallerHomeResponse,
    TelecallerLeadDetailRead,
    TelecallerLeadRead,
    TelecallerLeadUpdate,
    TelecallerLoanApplicationRead,
)
from app.services.loan_applications import InvalidStatusTransition as InvalidLoanStatusTransition
from app.services.loan_applications import (
    StatusReasonRequired,
    TerminalApplication,
    TermsNotAllowedAtStage,
    UnknownBank,
    apply_progress_update,
)
from app.services.telecaller import (
    LoanApplicationNotFound,
    LoanApplicationNotLoansLine,
    add_txn_history,
    get_application_for_telecaller,
    get_home_summary,
    get_last_activities,
    get_lead_for_telecaller,
    list_activities_for_lead,
    list_assigned_leads,
    list_loan_applications_for_lead,
    list_tasks_for_lead,
    list_txns_for_applications,
    log_call_activity,
    raise_task,
    update_lead,
)

router = APIRouter()


def _staff_profile_uuid(current_user: CurrentUser) -> UUID:
    if current_user.staff_profile_uuid is None:
        # pragma: no cover — every telecaller JWT carries one
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No staff profile on this account.")
    return current_user.staff_profile_uuid


@router.get("/leads", response_model=list[TelecallerLeadRead])
async def list_leads(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> list[TelecallerLeadRead]:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    leads = await list_assigned_leads(db, staff_profile_uuid, status_filter)
    last_by_lead = await get_last_activities(db, [lead.id for lead in leads])
    out: list[TelecallerLeadRead] = []
    for lead in leads:
        activity = last_by_lead.get(lead.id)
        out.append(
            TelecallerLeadRead(
                id=lead.id,
                name=lead.name,
                mobile=lead.mobile,
                business_line=lead.business_line,
                status=lead.status,
                requirement=lead.requirement,
                last_disposition=activity.disposition if activity else None,
                next_follow_up_at=activity.follow_up_at if activity else None,
                created_at=lead.created_at,
                updated_at=lead.updated_at,
            )
        )
    return out


@router.get("/leads/{lead_id}", response_model=TelecallerLeadDetailRead)
async def get_lead(
    lead_id: UUID,
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> TelecallerLeadDetailRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    lead = await get_lead_for_telecaller(db, lead_id, staff_profile_uuid)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.")
    activities = await list_activities_for_lead(db, lead_id)
    last = activities[0] if activities else None

    loan_applications: list[TelecallerLoanApplicationRead] = []
    if lead.business_line == "loans":
        applications = await list_loan_applications_for_lead(db, lead_id)
        txns_by_application = await list_txns_for_applications(
            db, [application.id for application in applications]
        )
        loan_applications = [
            TelecallerLoanApplicationRead(
                id=application.id,
                loan_type_name=application.loan_type.name,
                bank_id=application.bank_id,
                bank_name=application.bank.name if application.bank else None,
                amount_requested=application.amount_requested,
                amount_sanctioned=application.amount_sanctioned,
                interest_rate=application.interest_rate,
                processing_fee=application.processing_fee,
                fee_outcome=application.fee_outcome,
                status=application.status,
                status_reason=application.status_reason,
                closed_at=application.closed_at,
                txns=[
                    LoanTxnRead.model_validate(txn, from_attributes=True)
                    for txn in txns_by_application.get(application.id, [])
                ],
            )
            for application in applications
        ]

    tasks = await list_tasks_for_lead(db, lead_id)

    return TelecallerLeadDetailRead(
        id=lead.id,
        name=lead.name,
        mobile=lead.mobile,
        business_line=lead.business_line,
        status=lead.status,
        requirement=lead.requirement,
        last_disposition=last.disposition if last else None,
        next_follow_up_at=last.follow_up_at if last else None,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
        activities=[LeadActivityRead.model_validate(a, from_attributes=True) for a in activities],
        loan_applications=loan_applications,
        tasks=[TaskRead.model_validate(t, from_attributes=True) for t in tasks],
    )


@router.patch("/leads/{lead_id}", response_model=TelecallerLeadRead)
async def patch_lead(
    lead_id: UUID,
    payload: TelecallerLeadUpdate,
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> TelecallerLeadRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    lead = await get_lead_for_telecaller(db, lead_id, staff_profile_uuid)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.")
    lead = await update_lead(db, lead, payload)
    activity = (await get_last_activities(db, [lead.id])).get(lead.id)
    return TelecallerLeadRead(
        id=lead.id,
        name=lead.name,
        mobile=lead.mobile,
        business_line=lead.business_line,
        status=lead.status,
        requirement=lead.requirement,
        last_disposition=activity.disposition if activity else None,
        next_follow_up_at=activity.follow_up_at if activity else None,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


@router.post(
    "/leads/{lead_id}/activities",
    response_model=LeadActivityRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_activity(
    lead_id: UUID,
    payload: LeadActivityCreate,
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> LeadActivityRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    lead = await get_lead_for_telecaller(db, lead_id, staff_profile_uuid)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.")
    activity = await log_call_activity(db, lead, staff_profile_uuid, payload)
    return LeadActivityRead.model_validate(activity, from_attributes=True)


@router.post(
    "/loan-applications/{application_id}/txn-history",
    response_model=LoanTxnRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_loan_txn(
    application_id: UUID,
    payload: LoanTxnCreate,
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> LoanTxnRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    try:
        application = await get_application_for_telecaller(db, application_id, staff_profile_uuid)
    except LoanApplicationNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan application not found.") from exc
    except LoanApplicationNotLoansLine as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Transaction history is loans-line only."
        ) from exc
    txn = await add_txn_history(db, application, staff_profile_uuid, payload)
    return LoanTxnRead.model_validate(txn, from_attributes=True)


@router.patch(
    "/loan-applications/{application_id}",
    response_model=TelecallerLoanApplicationRead,
)
async def update_loan_application_progress(
    application_id: UUID,
    payload: LoanApplicationProgressUpdate,
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> TelecallerLoanApplicationRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    try:
        application = await get_application_for_telecaller(db, application_id, staff_profile_uuid)
    except LoanApplicationNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan application not found.") from exc
    except LoanApplicationNotLoansLine as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Loan status can only be updated on a loans-line application."
        ) from exc

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

    txns_by_application = await list_txns_for_applications(db, [application.id])
    return TelecallerLoanApplicationRead(
        id=application.id,
        loan_type_name=application.loan_type.name,
        bank_id=application.bank_id,
        bank_name=application.bank.name if application.bank else None,
        amount_requested=application.amount_requested,
        amount_sanctioned=application.amount_sanctioned,
        interest_rate=application.interest_rate,
        processing_fee=application.processing_fee,
        fee_outcome=application.fee_outcome,
        status=application.status,
        status_reason=application.status_reason,
        closed_at=application.closed_at,
        txns=[
            LoanTxnRead.model_validate(txn, from_attributes=True)
            for txn in txns_by_application.get(application.id, [])
        ],
    )


@router.post(
    "/leads/{lead_id}/tasks",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    lead_id: UUID,
    payload: TaskCreate,
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    lead = await get_lead_for_telecaller(db, lead_id, staff_profile_uuid)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.")
    task = await raise_task(db, lead, staff_profile_uuid, payload)
    return TaskRead.model_validate(task, from_attributes=True)


@router.get("/home", response_model=TelecallerHomeResponse)
async def home(
    current_user: CurrentUser = Depends(require_telecaller),
    db: AsyncSession = Depends(get_db),
) -> TelecallerHomeResponse:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    due, counts = await get_home_summary(db, staff_profile_uuid)
    return TelecallerHomeResponse(
        follow_ups_due=[
            TelecallerFollowUpItem(
                lead_uuid=lead.id,
                name=lead.name,
                mobile=lead.mobile,
                follow_up_at=follow_up_at,
            )
            for lead, follow_up_at in due
        ],
        counts_by_status=counts,
    )
