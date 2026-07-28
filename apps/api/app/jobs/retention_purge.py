"""7-year retention purge job (SRS 5.1). See services/retention_purge.py for
the actual query/delete logic and the payouts-before-transactions FK ordering
this delegates to.
"""

from __future__ import annotations

import logging
import time

from app.services import retention_purge

logger = logging.getLogger("scheduler")


async def retention_purge_job() -> None:
    """Purge delinked transactions/payouts past the retention window. Logs
    start/success/failure/duration."""
    started = time.monotonic()
    logger.info("job.retention_purge.start")
    try:
        summary = await retention_purge.purge_delinked_financial_records()
    except Exception:
        logger.exception("job.retention_purge.failed")
        raise
    else:
        logger.info(
            "job.retention_purge.success payouts_scanned=%d payouts_purged=%d "
            "transactions_scanned=%d transactions_purged=%d duration_ms=%d",
            summary.get("payouts_scanned", 0),
            summary.get("payouts_purged", 0),
            summary.get("transactions_scanned", 0),
            summary.get("transactions_purged", 0),
            (time.monotonic() - started) * 1000,
        )
        # No audit_log table exists yet (feature-status.md §3.3) for this
        # irreversible hard DELETE, so the purged (id, retained_ref) pairs are
        # logged here — retained_ref is not PII, just the former identity's
        # already-tombstoned auth_users.id — so a purge is reconstructable
        # from log retention alone.
        if summary.get("payouts_purged_ids"):
            logger.info("job.retention_purge.payouts_purged ids=%s", summary["payouts_purged_ids"])
        if summary.get("transactions_purged_ids"):
            logger.info(
                "job.retention_purge.transactions_purged ids=%s",
                summary["transactions_purged_ids"],
            )
