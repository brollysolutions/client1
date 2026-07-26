"""Delete orphaned agent-application KYC uploads (docs/specs/agent-application-intake.md).

The public upload-presign endpoint hands out a signed URL before any
AgentApplication row exists — an applicant who verifies OTP, uploads
documents, then abandons the form leaves objects in storage that nothing
ever references. A same-mobile-same-line re-apply upsert also leaves the
superseded objects behind (services/agent_applications.py::submit never
deletes inline, so a storage failure can't roll back the DB write). This job
is the only place either class of leftover gets cleaned up.

Known gap (tracked in docs/ai/feature-status.md §2): KYC objects belonging to
a REJECTED application are still referenced, so this job never deletes them —
that is a PII-retention item against SRS 5.1's 7-year purge, out of scope here.
"""

from __future__ import annotations

import logging
import time

from app.services import agent_applications

logger = logging.getLogger("scheduler")


async def purge_agent_application_orphans() -> None:
    """Sweep unreferenced agent-application uploads. Logs start/success/failure/duration."""
    started = time.monotonic()
    logger.info("job.purge_agent_application_orphans.start")
    try:
        summary = await agent_applications.purge_orphaned_uploads()
    except Exception:
        logger.exception("job.purge_agent_application_orphans.failed")
        raise
    else:
        logger.info(
            "job.purge_agent_application_orphans.success scanned=%d deleted=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("deleted", 0),
            (time.monotonic() - started) * 1000,
        )
