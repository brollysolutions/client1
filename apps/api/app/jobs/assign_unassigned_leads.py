"""Bounded idempotent retry for line-tagged leads awaiting a Telecaller."""

from __future__ import annotations

import logging
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.models.lead import Lead, LeadStatus
from app.services.leads import (
    LeadAssignmentNotice,
    auto_assign_locked_lead,
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
    leads = list(
        (
            await session.scalars(
                select(Lead)
                .where(
                    Lead.business_line.in_(("loans", "real_estate")),
                    Lead.assigned_telecaller_profile_uuid.is_(None),
                    Lead.status.in_((LeadStatus.NEW, LeadStatus.RELEASED)),
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
