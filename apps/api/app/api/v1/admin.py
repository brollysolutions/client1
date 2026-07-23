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
    AgentApplicationListResponse,
    AgentApplicationRead,
    AgentApproveResponse,
    AgentRejectRequest,
    LeadAssignRequest,
    LeadAssignResponse,
    StaffCreateRequest,
    StaffCreateResponse,
)
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

router = APIRouter()


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
