"""Agent lead sourcing + home summary (Agent Dashboard slice 1).

Every function here runs on the request-scoped `db` session (Depends(get_db)),
never a bypass AsyncSessionLocal session — leads_rls's agent branch already
narrows queries to this agent's own-originated, own-line leads. The explicit
`origin_agent_profile_uuid` filters below are defense-in-depth, not the only
wall, mirroring services.telecaller's own posture.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead, LeadStatus
from app.models.profile import AgentProfile
from app.schemas.agent import AgentLeadCreate, AgentLeadUpdate
from app.services.leads import capture_lead


class AgentProfileNotFound(Exception):
    """Raised when the current agent's AgentProfile row can't be found."""


class LeadCaptureFailed(Exception):
    """Raised when introduce_lead's capture write didn't produce a lead this
    agent can see — either the write itself failed (best-effort, rare), or the
    mobile's existing active lead is on the OTHER business line (see
    leads_rls's business_line-gated agent branch)."""


class LeadLocked(Exception):
    """Raised when a write is attempted on a lead already assigned to a telecaller."""


class InvalidStatusFilter(Exception):
    """Raised when list_my_leads is given a status_filter that isn't a valid LeadStatus value."""


async def get_home_summary(
    db: AsyncSession, agent_profile_uuid: UUID
) -> tuple[AgentProfile, dict[str, int]]:
    profile = await db.get(AgentProfile, agent_profile_uuid)
    if profile is None:
        raise AgentProfileNotFound
    leads = await list_my_leads(db, agent_profile_uuid)
    counts: dict[str, int] = {}
    for lead in leads:
        counts[lead.status.value] = counts.get(lead.status.value, 0) + 1
    return profile, counts


async def introduce_lead(
    db: AsyncSession,
    *,
    agent_profile_uuid: UUID,
    business_line: str,
    payload: AgentLeadCreate,
) -> Lead:
    """Capture a lead sourced by this agent. Reuses the same idempotent
    mobile-upsert as every other capture path (services.leads.capture_lead) —
    introducing an already-known mobile enriches that lead rather than
    duplicating it, and never steals attribution or business_line from
    whichever origin touched it first (both immutable once set).
    """
    committed = await capture_lead(
        payload.mobile,
        name=payload.name,
        business_line=business_line,
        origin="agent",
        origin_agent_profile_uuid=str(agent_profile_uuid),
        requirement=payload.requirement,
    )
    if not committed:
        raise LeadCaptureFailed

    lead = await db.scalar(
        select(Lead)
        .where(
            Lead.mobile == payload.mobile,
            Lead.origin_agent_profile_uuid == agent_profile_uuid,
            Lead.business_line == business_line,
        )
        .order_by(Lead.updated_at.desc())
        .limit(1)
    )
    if lead is None:
        # Committed, but not visible to this agent: the mobile's existing
        # active lead is on the OTHER business line (origin_agent_profile_uuid
        # may have backfilled without business_line matching — see the
        # leads_rls agent branch, which requires both).
        raise LeadCaptureFailed
    return lead


async def list_my_leads(
    db: AsyncSession, agent_profile_uuid: UUID, status_filter: str | None = None
) -> list[Lead]:
    stmt = select(Lead).where(Lead.origin_agent_profile_uuid == agent_profile_uuid)
    if status_filter is not None:
        try:
            status_enum = LeadStatus(status_filter)
        except ValueError as exc:
            raise InvalidStatusFilter from exc
        stmt = stmt.where(Lead.status == status_enum)
    stmt = stmt.order_by(Lead.updated_at.desc())
    return list((await db.scalars(stmt)).all())


async def get_lead_for_agent(
    db: AsyncSession, lead_id: UUID, agent_profile_uuid: UUID
) -> Lead | None:
    return await db.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.origin_agent_profile_uuid == agent_profile_uuid)
    )


async def update_lead_for_agent(db: AsyncSession, lead: Lead, payload: AgentLeadUpdate) -> Lead:
    if payload.name is not None:
        lead.name = payload.name
    if payload.requirement is not None:
        merged = dict(lead.requirement or {})
        merged.update(payload.requirement)
        lead.requirement = merged
    try:
        await db.commit()
    except DBAPIError as exc:
        await db.rollback()
        raise LeadLocked from exc
    await db.refresh(lead)
    return lead
