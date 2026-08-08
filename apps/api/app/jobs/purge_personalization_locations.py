"""Daily coarse-location retention cleanup."""

from __future__ import annotations

import logging
import time

from app.services.personalization import purge_stale_locations

logger = logging.getLogger("scheduler")


async def purge_personalization_locations() -> None:
    started = time.monotonic()
    logger.info("job.purge_personalization_locations.start")
    try:
        deleted = await purge_stale_locations()
    except Exception:
        logger.exception("job.purge_personalization_locations.failed")
        raise
    logger.info(
        "job.purge_personalization_locations.success cleared=%d duration_ms=%d",
        deleted,
        (time.monotonic() - started) * 1000,
    )
