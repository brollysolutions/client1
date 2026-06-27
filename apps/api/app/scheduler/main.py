"""Scheduler service entrypoint.

Per the platform rules, APScheduler runs in exactly ONE dedicated service (never in
every API replica). Jobs must be idempotent and must log start, success, failure, and
duration. This bootstrap wires the scheduler and a heartbeat; real jobs (agent-lead
expiry → open pool FR-4.6; 7-year PII purge SRS 5.1) register here as they land.
"""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import suppress
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import settings

logger = logging.getLogger("scheduler")
logging.basicConfig(level=settings.LOG_LEVEL.upper())

# Liveness marker: the scheduler has no HTTP port, so the heartbeat job touches this
# file each run and the container healthcheck asserts its freshness.
HEARTBEAT_FILE = Path("/tmp/scheduler.alive")  # noqa: S108 — container-local, non-sensitive


def _mark_alive() -> None:
    HEARTBEAT_FILE.touch(exist_ok=True)


async def heartbeat() -> None:
    """Idempotent liveness job — proves the scheduler loop is running."""
    started = time.monotonic()
    logger.info("job.heartbeat.start")
    try:
        _mark_alive()
    except Exception:
        logger.exception("job.heartbeat.failed")
        raise
    else:
        logger.info("job.heartbeat.success duration_ms=%d", (time.monotonic() - started) * 1000)


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        heartbeat,
        trigger="interval",
        minutes=1,
        id="heartbeat",
        max_instances=1,  # no overlapping runs
        coalesce=True,  # collapse missed runs into one
        replace_existing=True,  # idempotent registration on restart
    )
    return scheduler


async def main() -> None:
    scheduler = build_scheduler()
    _mark_alive()  # fresh marker immediately so the healthcheck passes before the first run
    scheduler.start()
    logger.info("scheduler.startup env=%s jobs=%d", settings.ENV, len(scheduler.get_jobs()))
    try:
        # Keep the event loop alive; APScheduler runs jobs in the background.
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown(wait=False)
        logger.info("scheduler.shutdown")


if __name__ == "__main__":
    with suppress(KeyboardInterrupt, SystemExit):
        asyncio.run(main())
