"""Sweep stale private property submissions and inactive public media."""

from __future__ import annotations

import logging
import time

from app.services import property_submissions

logger = logging.getLogger("scheduler")


async def purge_property_media() -> None:
    started = time.monotonic()
    logger.info("job.purge_property_media.start")
    try:
        summary = await property_submissions.purge_media_lifecycle()
    except Exception:
        logger.exception("job.purge_property_media.failed")
        raise
    else:
        logger.info(
            "job.purge_property_media.success scanned=%d deleted=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("deleted", 0),
            (time.monotonic() - started) * 1000,
        )
