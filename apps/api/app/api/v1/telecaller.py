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
from app.schemas.telecaller import (
    LeadActivityCreate,
    LeadActivityRead,
    TelecallerFollowUpItem,
    TelecallerHomeResponse,
    TelecallerLeadDetailRead,
    TelecallerLeadRead,
    TelecallerLeadUpdate,
)
from app.services.telecaller import (
    get_home_summary,
    get_last_activities,
    get_lead_for_telecaller,
    list_activities_for_lead,
    list_assigned_leads,
    log_call_activity,
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
