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
from sqlalchemy import delete, func

import app.db.session as db_session
from app.core.config import settings
from app.jobs.backfill_customer_codes import backfill_customer_codes
from app.jobs.reconcile_payouts import reconcile_payouts
from app.models.auth import RefreshToken

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


async def prune_expired_refresh_tokens() -> None:
    """Delete naturally-expired refresh tokens so the table cannot grow unbounded.

    Every rotation inserts a new row and only flips the old one to revoked=True, so
    without pruning the table grows one row per refresh forever, degrading the
    token_hash lookup on every /refresh + /logout. Deleting only rows past
    expires_at is safe: an expired token is already rejected by the expiry check
    (revoked or not), so this removes nothing a live request could still use.
    Idempotent — a second run finds nothing new. Runs on the app superuser session
    (bypasses RLS), same as lead capture.
    """
    started = time.monotonic()
    logger.info("job.prune_refresh_tokens.start")
    try:
        # Resolve the sessionmaker at call time (not an import-bound name) so the
        # test suite's NullPool rebind is honoured; in production this is the
        # normal pooled engine.
        async with db_session.AsyncSessionLocal() as session:
            result = await session.execute(
                delete(RefreshToken).where(RefreshToken.expires_at < func.now())
            )
            await session.commit()
            deleted = result.rowcount
    except Exception:
        logger.exception("job.prune_refresh_tokens.failed")
        raise
    else:
        logger.info(
            "job.prune_refresh_tokens.success deleted=%d duration_ms=%d",
            deleted,
            (time.monotonic() - started) * 1000,
        )


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
    scheduler.add_job(
        prune_expired_refresh_tokens,
        trigger="interval",
        hours=24,  # daily housekeeping; expired tokens are not time-critical
        id="prune_refresh_tokens",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.add_job(
        backfill_customer_codes,
        trigger="interval",
        hours=6,  # safety net; registration provisions codes synchronously, so hits are ~0
        id="backfill_customer_codes",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.add_job(
        reconcile_payouts,
        trigger="interval",
        minutes=15,  # settle stuck live payouts; a no-op in mock mode (main/dev)
        id="reconcile_payouts",
        max_instances=1,  # never overlap a sweep with itself
        coalesce=True,
        replace_existing=True,
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
