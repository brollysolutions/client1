"""Agent router — home summary, lead introduction/tracking (Agent Dashboard slice 1).

Every route depends on require_agent (app-layer gate) on top of the leads_rls
own-origin RLS predicate (defense in depth, same posture as every other
role-gated router in this codebase).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_agent
from app.db.session import get_db
from app.models.field_visibility import FieldTargetRole, FieldVisibilityMode
from app.models.lead import Lead
from app.schemas.agent import (
    AgentHomeResponse,
    AgentLeadCreate,
    AgentLeadRead,
    AgentLeadUpdate,
    AgentProfileStatusRead,
)
from app.schemas.commissions import AgentEarningsResponse
from app.services import commissions
from app.services.agent import (
    AgentProfileNotFound,
    InvalidStatusFilter,
    LeadCaptureFailed,
    LeadCaptureUnavailable,
    LeadLocked,
    get_home_summary,
    get_lead_for_agent,
    introduce_lead,
    list_my_leads,
    update_lead_for_agent,
)
from app.services.field_visibility import effective_modes, project_values

router = APIRouter()


def _agent_profile_uuid(current_user: CurrentUser) -> UUID:
    if current_user.agent_profile_uuid is None:
        # pragma: no cover — every agent JWT carries one
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No agent profile on this account.")
    return current_user.agent_profile_uuid


def _to_agent_lead_read(
    lead: Lead, modes: dict[tuple[str, str], FieldVisibilityMode]
) -> AgentLeadRead:
    within_window = lead.expires_at is None or lead.expires_at > datetime.now(UTC)
    return AgentLeadRead(
        id=lead.id,
        mobile=lead.mobile,
        business_line=lead.business_line,
        status="expired" if lead.agent_expired_at is not None else lead.status,
        registered=lead.client_profile_uuid is not None,
        editable=(
            lead.status in {"new", "assigned"} and lead.agent_expired_at is None and within_window
        ),
        expires_at=lead.expires_at,
        expired_at=lead.agent_expired_at,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
        **project_values(
            modes,
            "lead",
            {"name": lead.name, "requirement": lead.requirement},
        ),
    )


@router.get("/home", response_model=AgentHomeResponse)
async def home(
    current_user: CurrentUser = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentHomeResponse:
    agent_profile_uuid = _agent_profile_uuid(current_user)
    try:
        profile, counts = await get_home_summary(db, agent_profile_uuid)
    except AgentProfileNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent profile not found.") from exc
    return AgentHomeResponse(
        profile=AgentProfileStatusRead(
            agent_code=profile.agent_code,
            business_line=profile.business_line,
            kyc_status=profile.kyc_status,
            status=profile.status,
            rera_code=profile.rera_code,
            approved_at=profile.approved_at,
        ),
        counts_by_status=counts,
    )


@router.post(
    "/leads",
    response_model=AgentLeadRead,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_lead(
    payload: AgentLeadCreate,
    current_user: CurrentUser = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentLeadRead:
    agent_profile_uuid = _agent_profile_uuid(current_user)
    business_line = current_user.business_line
    if business_line not in ("loans", "real_estate"):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Your agent profile has no business line set."
        )
    try:
        lead = await introduce_lead(
            db,
            agent_profile_uuid=agent_profile_uuid,
            business_line=business_line,
            payload=payload,
        )
    except LeadCaptureUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Lead capture is temporarily unavailable. Please try again.",
        ) from exc
    except LeadCaptureFailed as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This mobile number is already linked to an existing enquiry.",
        ) from exc
    modes = await effective_modes(db, FieldTargetRole.AGENT)
    return _to_agent_lead_read(lead, modes)


@router.get("/leads", response_model=list[AgentLeadRead], response_model_exclude_unset=True)
async def list_leads(
    status_filter: str | None = None,
    current_user: CurrentUser = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> list[AgentLeadRead]:
    agent_profile_uuid = _agent_profile_uuid(current_user)
    try:
        leads = await list_my_leads(db, agent_profile_uuid, status_filter)
    except InvalidStatusFilter as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown status_filter value."
        ) from exc
    modes = await effective_modes(db, FieldTargetRole.AGENT)
    return [_to_agent_lead_read(lead, modes) for lead in leads]


@router.get("/leads/{lead_id}", response_model=AgentLeadRead, response_model_exclude_unset=True)
async def get_lead(
    lead_id: UUID,
    current_user: CurrentUser = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentLeadRead:
    agent_profile_uuid = _agent_profile_uuid(current_user)
    lead = await get_lead_for_agent(db, lead_id, agent_profile_uuid)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.")
    modes = await effective_modes(db, FieldTargetRole.AGENT)
    return _to_agent_lead_read(lead, modes)


@router.patch("/leads/{lead_id}", response_model=AgentLeadRead, response_model_exclude_unset=True)
async def patch_lead(
    lead_id: UUID,
    payload: AgentLeadUpdate,
    current_user: CurrentUser = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentLeadRead:
    agent_profile_uuid = _agent_profile_uuid(current_user)
    lead = await get_lead_for_agent(db, lead_id, agent_profile_uuid)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found.")
    try:
        lead = await update_lead_for_agent(
            db,
            lead,
            payload,
            auth_user_uuid=current_user.id,
            agent_profile_uuid=agent_profile_uuid,
        )
    except LeadLocked as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This lead is already being worked or its Agent window has ended "
            "and it can no longer be edited.",
        ) from exc
    modes = await effective_modes(db, FieldTargetRole.AGENT)
    return _to_agent_lead_read(lead, modes)


@router.get("/earnings", response_model=AgentEarningsResponse)
async def earnings(
    current_user: CurrentUser = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentEarningsResponse:
    """Read-only commission ledger + totals. No agent_profile_uuid filter
    needed here — commissions_select RLS already scopes to the caller's own
    agent_auth_user_uuid + business_line."""
    return await commissions.list_for_agent(db)
