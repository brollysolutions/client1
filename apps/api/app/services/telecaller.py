"""Telecaller lead follow-up — list/detail/status-update/call-log/home summary.

Every function here runs on the request-scoped `db` session (Depends(get_db)),
not a bypass AsyncSessionLocal session: post-migration e6c7b8f9a0d1, leads_rls
already narrows a telecaller's queries to their own assigned leads, and
lead_activities_rls narrows to their own logged rows. The explicit
`assigned_telecaller_profile_uuid` filters below are defense-in-depth, not the
only wall.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead, LeadStatus
from app.models.lead_activity import CallDisposition, InterestLevel, LeadActivity
from app.schemas.telecaller import LeadActivityCreate, TelecallerLeadUpdate

_TERMINAL_STATUSES = {LeadStatus.CONVERTED, LeadStatus.CLOSED, LeadStatus.RELEASED}


async def list_assigned_leads(
    db: AsyncSession, staff_profile_uuid: UUID, status_filter: str | None = None
) -> list[Lead]:
    stmt = select(Lead).where(Lead.assigned_telecaller_profile_uuid == staff_profile_uuid)
    if status_filter is not None:
        stmt = stmt.where(Lead.status == LeadStatus(status_filter))
    stmt = stmt.order_by(Lead.updated_at.desc())
    return list((await db.scalars(stmt)).all())


async def get_last_activities(db: AsyncSession, lead_ids: list[UUID]) -> dict[UUID, LeadActivity]:
    """Most recent lead_activities row per lead id (empty dict if lead_ids is empty)."""
    if not lead_ids:
        return {}
    stmt = (
        select(LeadActivity)
        .where(LeadActivity.lead_uuid.in_(lead_ids))
        .order_by(LeadActivity.lead_uuid, LeadActivity.created_at.desc())
    )
    rows = (await db.scalars(stmt)).all()
    last_by_lead: dict[UUID, LeadActivity] = {}
    for row in rows:
        last_by_lead.setdefault(row.lead_uuid, row)
    return last_by_lead


async def get_lead_for_telecaller(
    db: AsyncSession, lead_id: UUID, staff_profile_uuid: UUID
) -> Lead | None:
    return await db.scalar(
        select(Lead).where(
            Lead.id == lead_id, Lead.assigned_telecaller_profile_uuid == staff_profile_uuid
        )
    )


async def list_activities_for_lead(db: AsyncSession, lead_id: UUID) -> list[LeadActivity]:
    stmt = (
        select(LeadActivity)
        .where(LeadActivity.lead_uuid == lead_id)
        .order_by(LeadActivity.created_at.desc())
    )
    return list((await db.scalars(stmt)).all())


async def update_lead(db: AsyncSession, lead: Lead, payload: TelecallerLeadUpdate) -> Lead:
    if payload.status is not None:
        lead.status = LeadStatus(payload.status)
    if payload.requirement is not None:
        merged = dict(lead.requirement or {})
        merged.update(payload.requirement)
        lead.requirement = merged
    await db.commit()
    await db.refresh(lead)
    return lead


async def log_call_activity(
    db: AsyncSession, lead: Lead, staff_profile_uuid: UUID, payload: LeadActivityCreate
) -> LeadActivity:
    """Insert a call-attempt row. First contact on an ASSIGNED lead bumps it to
    WORKING (design doc §6 flow 2)."""
    activity = LeadActivity(
        lead_uuid=lead.id,
        telecaller_staff_profile_uuid=staff_profile_uuid,
        business_line=lead.business_line,
        disposition=CallDisposition(payload.disposition),
        interest_level=InterestLevel(payload.interest_level) if payload.interest_level else None,
        notes=payload.notes,
        follow_up_at=payload.follow_up_at,
    )
    db.add(activity)
    if lead.status == LeadStatus.ASSIGNED:
        lead.status = LeadStatus.WORKING
    await db.commit()
    await db.refresh(activity)
    return activity


async def get_home_summary(
    db: AsyncSession, staff_profile_uuid: UUID
) -> tuple[list[tuple[Lead, datetime]], dict[str, int]]:
    """Returns (follow_ups_due, counts_by_status).

    follow_ups_due pairs a lead with its most recent activity's follow_up_at, for
    every non-terminal assigned lead whose latest logged attempt has a
    follow_up_at at or before now. Sorted soonest-first.
    """
    leads = await list_assigned_leads(db, staff_profile_uuid)
    counts: dict[str, int] = {}
    for lead in leads:
        counts[lead.status.value] = counts.get(lead.status.value, 0) + 1

    if not leads:
        return [], counts

    last_by_lead = await get_last_activities(db, [lead.id for lead in leads])
    now = datetime.now(UTC)
    due: list[tuple[Lead, datetime]] = []
    for lead in leads:
        if lead.status in _TERMINAL_STATUSES:
            continue
        activity = last_by_lead.get(lead.id)
        if activity is None or activity.follow_up_at is None:
            continue
        follow_up_at = activity.follow_up_at
        if follow_up_at.tzinfo is None:
            follow_up_at = follow_up_at.replace(tzinfo=UTC)
        if follow_up_at <= now:
            due.append((lead, activity.follow_up_at))
    due.sort(key=lambda pair: pair[1])
    return due, counts
