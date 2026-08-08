"""Agent lead sourcing + home summary (Agent Dashboard slice 1).

Read/update functions run on the request-scoped RLS session. Lead introduction
delegates its mobile-identity, Agent-attribution, and automatic-assignment
transaction to services.leads, then re-reads the result through the Agent's RLS
session before returning it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead, LeadStatus
from app.models.profile import AgentProfile
from app.schemas.agent import AgentLeadCreate, AgentLeadUpdate
from app.services.leads import AgentLeadConflict, capture_agent_lead


class AgentProfileNotFound(Exception):
    """Raised when the current agent's AgentProfile row can't be found."""


class LeadCaptureFailed(Exception):
    """Raised when introduce_lead's capture write committed but produced no
    lead this agent can see or claim — blocked by the conflict guard (the
    mobile's existing active lead is on the OTHER business line, already
    assigned to a telecaller, or attributed to a different agent; see
    leads_rls's business_line-gated agent branch and services.leads.capture_lead's
    conflict_guard)."""


class LeadCaptureUnavailable(Exception):
    """Raised when capture_lead's own write didn't commit (transient DB failure, rare).
    Distinct from LeadCaptureFailed, which means the write committed fine but the
    resulting lead isn't one this agent can see or claim (cross-line, locked, or
    attributed to another agent)."""


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
        status = "expired" if lead.agent_expired_at is not None else lead.status.value
        counts[status] = counts.get(status, 0) + 1
    return profile, counts


async def introduce_lead(
    db: AsyncSession,
    *,
    agent_profile_uuid: UUID,
    business_line: str,
    payload: AgentLeadCreate,
) -> Lead:
    """Capture and automatically assign a lead sourced by this Agent."""
    try:
        lead = await capture_agent_lead(
            mobile=payload.mobile,
            name=payload.name,
            business_line=business_line,
            agent_profile_uuid=agent_profile_uuid,
            requirement=payload.requirement,
        )
    except AgentLeadConflict as exc:
        raise LeadCaptureFailed from exc
    except Exception as exc:
        raise LeadCaptureUnavailable from exc

    # Re-read through the Agent's request-scoped RLS session so the response is
    # shaped only from a row the caller remains authorized to see.
    visible = await db.scalar(
        select(Lead).where(
            Lead.id == lead.id,
            Lead.origin_agent_profile_uuid == agent_profile_uuid,
            Lead.business_line == business_line,
        )
    )
    if visible is None:
        raise LeadCaptureFailed
    return visible


async def list_my_leads(
    db: AsyncSession, agent_profile_uuid: UUID, status_filter: str | None = None
) -> list[Lead]:
    stmt = select(Lead).where(Lead.origin_agent_profile_uuid == agent_profile_uuid)
    if status_filter is not None:
        if status_filter == "expired":
            stmt = stmt.where(Lead.agent_expired_at.is_not(None))
        else:
            try:
                status_enum = LeadStatus(status_filter)
            except ValueError as exc:
                raise InvalidStatusFilter from exc
            stmt = stmt.where(Lead.agent_expired_at.is_(None), Lead.status == status_enum)
    stmt = stmt.order_by(Lead.updated_at.desc())
    return list((await db.scalars(stmt)).all())


async def get_lead_for_agent(
    db: AsyncSession, lead_id: UUID, agent_profile_uuid: UUID
) -> Lead | None:
    return await db.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.origin_agent_profile_uuid == agent_profile_uuid)
    )


async def update_lead_for_agent(db: AsyncSession, lead: Lead, payload: AgentLeadUpdate) -> Lead:
    deadline_reached = lead.expires_at is not None and lead.expires_at <= datetime.now(UTC)
    if (
        lead.assigned_telecaller_profile_uuid is not None
        or lead.agent_expired_at is not None
        or deadline_reached
    ):
        raise LeadLocked
    if payload.name is not None:
        lead.name = payload.name
    if payload.requirement is not None:
        merged = dict(lead.requirement) if isinstance(lead.requirement, dict) else {}
        merged.update(payload.requirement)
        lead.requirement = merged
    try:
        await db.commit()
    except DBAPIError as exc:
        await db.rollback()
        raise LeadLocked from exc
    await db.refresh(lead)
    return lead
