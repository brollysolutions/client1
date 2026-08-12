"""Bounded retry for field tasks and ready pickups awaiting an Employee."""

from __future__ import annotations

import logging
import time

import app.db.session as db_session
from app.services.employee_assignment import (
    assign_employee_work_batch,
    notify_employee_assignments,
)

logger = logging.getLogger("scheduler")


async def assign_unassigned_employee_work() -> dict[str, int]:
    started = time.monotonic()
    logger.info("job.assign_unassigned_employee_work.start")
    try:
        async with db_session.AsyncSessionLocal() as session:
            attempted, notices = await assign_employee_work_batch(session)
        await notify_employee_assignments(notices)
    except Exception:
        logger.exception("job.assign_unassigned_employee_work.failed")
        raise
    logger.info(
        "job.assign_unassigned_employee_work.success attempted=%d assigned=%d duration_ms=%d",
        attempted,
        len(notices),
        (time.monotonic() - started) * 1000,
    )
    return {"attempted": attempted, "assigned": len(notices)}
