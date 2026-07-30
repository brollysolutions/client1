"""Delete orphaned employee task-document uploads.

The presign endpoint hands out a signed URL before any TaskDocument row
exists — an employee who requests a presign, uploads, then never calls
confirm (closes the tab, network drop) leaves an object in storage that
nothing references. This job is the only place that leftover gets cleaned
up. Mirrors jobs/purge_loan_document_orphans.py exactly; closes the gap
those jobs' docstrings flagged (feature-status.md §2): the tasks/ storage
prefix had no equivalent sweep.
"""

from __future__ import annotations

import logging
import time

from app.services import employee

logger = logging.getLogger("scheduler")


async def purge_task_document_orphans() -> None:
    """Sweep unreferenced task-document uploads. Logs start/success/failure/duration."""
    started = time.monotonic()
    logger.info("job.purge_task_document_orphans.start")
    try:
        summary = await employee.purge_orphaned_task_documents()
    except Exception:
        logger.exception("job.purge_task_document_orphans.failed")
        raise
    else:
        logger.info(
            "job.purge_task_document_orphans.success scanned=%d deleted=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("deleted", 0),
            (time.monotonic() - started) * 1000,
        )
