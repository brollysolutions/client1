"""Run bounded managed-media processing and private-media retention."""

from __future__ import annotations

import logging
import time

from app.services import managed_media

logger = logging.getLogger("scheduler")


async def process_pending_media() -> None:
    started = time.monotonic()
    logger.info("job.process_pending_media.start")
    try:
        summary = await managed_media.process_pending_media()
    except Exception:
        logger.exception("job.process_pending_media.failed")
        raise
    logger.info(
        "job.process_pending_media.success processed=%d duration_ms=%d",
        summary["processed"],
        (time.monotonic() - started) * 1000,
    )


async def purge_expired_private_media() -> None:
    started = time.monotonic()
    logger.info("job.purge_expired_private_media.start")
    try:
        summary = await managed_media.purge_expired_private_media()
    except Exception:
        logger.exception("job.purge_expired_private_media.failed")
        raise
    logger.info(
        "job.purge_expired_private_media.success deleted_rows=%d deleted_objects=%d duration_ms=%d",
        summary["deleted_rows"],
        summary["deleted_objects"],
        (time.monotonic() - started) * 1000,
    )
