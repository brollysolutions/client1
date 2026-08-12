"""Bounded idempotent retry for line-tagged leads awaiting a Telecaller."""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.models.lead import Lead, LeadStatus
from app.models.profile import ProfileStatus, StaffProfile, StaffRole
from app.services.leads import (
    LeadAssignmentNotice,
    auto_assign_locked_lead,
    customer_lead_predicates,
    lock_assignment_lines,
    notify_lead_assignments,
)

logger = logging.getLogger("scheduler")

_BATCH_SIZE = 200


async def _assign_batch(
    session: AsyncSession,
) -> tuple[int, list[LeadAssignmentNotice]]:
    # Automatic assignment elsewhere locks line before lead rows. Take both
    # operational line locks in the same order before this mixed-line SELECT,
    # preventing a registration/retry deadlock while retaining SKIP LOCKED for
    # unrelated manual lead work.
    await lock_assignment_lines(session, {"loans", "real_estate"})
    stale = list(
        (
            await session.scalars(
                select(Lead)
                .outerjoin(
                    StaffProfile,
                    StaffProfile.id == Lead.assigned_telecaller_profile_uuid,
                )
                .where(
                    Lead.status.in_((LeadStatus.ASSIGNED, LeadStatus.WORKING)),
                    or_(
                        StaffProfile.id.is_(None),
                        StaffProfile.status != ProfileStatus.ACTIVE,
                        StaffProfile.role != StaffRole.TELECALLER,
                        and_(
                            StaffProfile.business_line != "both",
                            StaffProfile.business_line != Lead.business_line,
                        ),
                    ),
                    *customer_lead_predicates(),
                )
                .order_by(Lead.created_at, Lead.id)
                .limit(_BATCH_SIZE)
                .with_for_update(of=Lead, skip_locked=True)
            )
        ).all()
    )
    for lead in stale:
        lead.assigned_telecaller_profile_uuid = None
        lead.status = LeadStatus.RELEASED
        lead.released_at = datetime.now(UTC)
        lead.release_reason = "Previous Telecaller is no longer eligible."
    if stale:
        await session.flush()
    leads = list(
        (
            await session.scalars(
                select(Lead)
                .where(
                    Lead.business_line.in_(("loans", "real_estate")),
                    Lead.assigned_telecaller_profile_uuid.is_(None),
                    Lead.status.in_((LeadStatus.NEW, LeadStatus.RELEASED)),
                    *customer_lead_predicates(),
                )
                .order_by(Lead.created_at, Lead.id)
                .limit(_BATCH_SIZE)
                .with_for_update(skip_locked=True)
            )
        ).all()
    )
    notices: list[LeadAssignmentNotice] = []
    for lead in leads:
        notice = await auto_assign_locked_lead(session, lead)
        if notice is not None:
            notices.append(notice)
    await session.commit()
    return len(leads), notices


async def assign_unassigned_leads() -> dict[str, int]:
    started = time.monotonic()
    logger.info("job.assign_unassigned_leads.start")
    try:
        async with db_session.AsyncSessionLocal() as session:
            attempted, notices = await _assign_batch(session)
        await notify_lead_assignments(notices)
    except Exception:
        logger.exception("job.assign_unassigned_leads.failed")
        raise
    else:
        logger.info(
            "job.assign_unassigned_leads.success attempted=%d assigned=%d duration_ms=%d",
            attempted,
            len(notices),
            (time.monotonic() - started) * 1000,
        )
        return {"attempted": attempted, "assigned": len(notices)}
