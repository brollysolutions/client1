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
from sqlalchemy.orm import selectinload

from app.models.lead import Lead, LeadStatus
from app.models.lead_activity import CallDisposition, InterestLevel, LeadActivity
from app.models.loan import LoanApplication, LoanTxnHistory
from app.models.property_deal import PropertyDeal
from app.models.task import Task, TaskStatus, TaskType
from app.schemas.telecaller import (
    LeadActivityCreate,
    LoanTxnCreate,
    TaskCreate,
    TelecallerLeadUpdate,
)

_TERMINAL_STATUSES = {LeadStatus.CONVERTED, LeadStatus.CLOSED, LeadStatus.RELEASED}


class LoanApplicationNotFound(Exception):
    """Raised when the target loan_application isn't visible to this telecaller."""


class LoanApplicationNotLoansLine(Exception):
    """Raised when txn history is entered against a non-loans application."""


class PropertyDealNotFound(Exception):
    """Raised when the target property_deal isn't visible to this telecaller."""


class PropertyDealNotRealEstateLine(Exception):
    """Raised when a property deal is actioned against a non-real-estate lead."""


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


async def list_loan_applications_for_lead(db: AsyncSession, lead_id: UUID) -> list[LoanApplication]:
    """Loan applications hanging off a lead, loan_type/bank preloaded. Call only
    for a loans-line lead — real-estate leads have no loan_applications."""
    stmt = (
        select(LoanApplication)
        .where(LoanApplication.lead_uuid == lead_id)
        .options(selectinload(LoanApplication.loan_type), selectinload(LoanApplication.bank))
        .order_by(LoanApplication.opened_at.desc())
    )
    return list((await db.scalars(stmt)).all())


async def list_txns_for_applications(
    db: AsyncSession, application_ids: list[UUID]
) -> dict[UUID, list[LoanTxnHistory]]:
    if not application_ids:
        return {}
    stmt = (
        select(LoanTxnHistory)
        .where(LoanTxnHistory.loan_application_uuid.in_(application_ids))
        .order_by(LoanTxnHistory.created_at.desc())
    )
    rows = (await db.scalars(stmt)).all()
    by_application: dict[UUID, list[LoanTxnHistory]] = {aid: [] for aid in application_ids}
    for row in rows:
        by_application.setdefault(row.loan_application_uuid, []).append(row)
    return by_application


async def get_application_for_telecaller(
    db: AsyncSession, application_id: UUID, staff_profile_uuid: UUID
) -> LoanApplication:
    """Defense-in-depth atop loan_txn_history_rls: confirms the application's
    lead is assigned to this telecaller and the line is loans (FR-6.5 scope)."""
    application = await db.scalar(
        select(LoanApplication)
        .join(Lead, Lead.id == LoanApplication.lead_uuid)
        .where(
            LoanApplication.id == application_id,
            Lead.assigned_telecaller_profile_uuid == staff_profile_uuid,
        )
    )
    if application is None:
        raise LoanApplicationNotFound
    if application.business_line != "loans":
        raise LoanApplicationNotLoansLine
    return application


async def add_txn_history(
    db: AsyncSession,
    application: LoanApplication,
    staff_profile_uuid: UUID,
    payload: LoanTxnCreate,
) -> LoanTxnHistory:
    txn = LoanTxnHistory(
        loan_application_uuid=application.id,
        business_line=application.business_line,
        entered_by_staff_profile_uuid=staff_profile_uuid,
        bank_name=payload.bank_name,
        amount=payload.amount,
        interest_rate=payload.interest_rate,
        txn_date=payload.txn_date,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


async def list_property_deals_for_lead(db: AsyncSession, lead_id: UUID) -> list[PropertyDeal]:
    """Property deals hanging off a lead, property preloaded. Call only for a
    real-estate-line lead — loans leads have no property_deals."""
    stmt = (
        select(PropertyDeal)
        .where(PropertyDeal.lead_uuid == lead_id)
        .options(selectinload(PropertyDeal.property))
        .order_by(PropertyDeal.opened_at.desc())
    )
    return list((await db.scalars(stmt)).all())


async def get_deal_for_telecaller(
    db: AsyncSession, deal_id: UUID, staff_profile_uuid: UUID
) -> PropertyDeal:
    """Defense-in-depth atop property_deals_rls: confirms the deal's lead is
    assigned to this telecaller and the line is real_estate."""
    deal = await db.scalar(
        select(PropertyDeal)
        .join(Lead, Lead.id == PropertyDeal.lead_uuid)
        .options(selectinload(PropertyDeal.property))
        .where(
            PropertyDeal.id == deal_id,
            Lead.assigned_telecaller_profile_uuid == staff_profile_uuid,
        )
    )
    if deal is None:
        raise PropertyDealNotFound
    if deal.business_line != "real_estate":
        raise PropertyDealNotRealEstateLine
    return deal


async def raise_task(
    db: AsyncSession, lead: Lead, staff_profile_uuid: UUID, payload: TaskCreate
) -> Task:
    """Raise an unassigned document_collection task against an assigned lead
    (Open Item A). Lands in the pool; Admin hands it to an employee."""
    task = Task(
        raised_by_staff_profile_uuid=staff_profile_uuid,
        business_line=lead.business_line,
        task_type=TaskType.DOCUMENT_COLLECTION,
        lead_uuid=lead.id,
        status=TaskStatus.UNASSIGNED,
        notes=payload.notes,
        due_at=payload.due_at,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def list_tasks_for_lead(db: AsyncSession, lead_id: UUID) -> list[Task]:
    stmt = select(Task).where(Task.lead_uuid == lead_id).order_by(Task.created_at.desc())
    return list((await db.scalars(stmt)).all())
