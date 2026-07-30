"""Delete orphaned banner images under the public/banners/ storage prefix.

The upload-presign endpoint (POST /api/v1/banners/image-upload-url) hands out
a signed URL before any Banner row references the resulting key — a Sub Admin
who picks an image, then abandons the draft (closes the tab, never hits Save)
leaves an object in storage that nothing points at. A re-upload on an
already-saved banner leaves the superseded key behind too (services/banners.py
never deletes the old key inline). This job is the only place either leftover
gets cleaned up. Mirrors jobs/purge_loan_document_orphans.py exactly.

Unlike the other two upload prefixes (agent-applications/, tasks/), these
objects are anonymously world-readable by bucket policy — an accumulating pile
of orphans here is not just storage cost, it's a growing set of unlinked
objects publicly reachable by anyone who knows or guesses the key. Not a
security hole on its own (nothing else identifies these keys), but a reason
this job is "not optional" the way the others merely aren't urgent.
"""

from __future__ import annotations

import logging
import time

from app.services import banners

logger = logging.getLogger("scheduler")


async def purge_banner_image_orphans() -> None:
    """Sweep unreferenced banner images. Logs start/success/failure/duration."""
    started = time.monotonic()
    logger.info("job.purge_banner_image_orphans.start")
    try:
        summary = await banners.purge_orphaned_uploads()
    except Exception:
        logger.exception("job.purge_banner_image_orphans.failed")
        raise
    else:
        logger.info(
            "job.purge_banner_image_orphans.success scanned=%d deleted=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("deleted", 0),
            (time.monotonic() - started) * 1000,
        )
