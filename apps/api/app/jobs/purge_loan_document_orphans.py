"""Delete orphaned client loan-document KYC uploads (docs/specs/client-kyc-upload.md).

The presign endpoint hands out a signed URL before any LoanDocument row
exists — a client who requests a presign, uploads, then never calls confirm
(closes the tab, network drop) leaves an object in storage that nothing
references. This job is the only place that leftover gets cleaned up.
Mirrors jobs/purge_agent_application_orphans.py exactly.

Known pre-existing gap, NOT introduced or fixed by this job (tracked in
docs/ai/feature-status.md §2): the `tasks/` storage prefix (employee task
documents) has no equivalent sweep at all.
"""

from __future__ import annotations

import logging
import time

from app.services import loan_documents

logger = logging.getLogger("scheduler")


async def purge_loan_document_orphans() -> None:
    """Sweep unreferenced loan-document uploads. Logs start/success/failure/duration."""
    started = time.monotonic()
    logger.info("job.purge_loan_document_orphans.start")
    try:
        summary = await loan_documents.purge_orphaned_uploads()
    except Exception:
        logger.exception("job.purge_loan_document_orphans.failed")
        raise
    else:
        logger.info(
            "job.purge_loan_document_orphans.success scanned=%d deleted=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("deleted", 0),
            (time.monotonic() - started) * 1000,
        )
