"""Reconcile referral/commission/fee_cashback rows that drifted from their payout.

Closes the gap in services.payments._payout_paid_hook / _payout_released_hook:
both delegate to services.payout_links, whose callees (referrals.
mark_paid_from_payout, commissions.release_payout_link, etc.) are all
best-effort and swallow their own exceptions — a bug or transient failure on
that side leaves a payout correctly settled while its source row is stuck
accrued/pending, still pointing at the payout, with nothing to notice. This
job periodically re-drives whichever hook a source row is still missing.

NOT live-only, unlike jobs/reconcile_payouts.py: the hooks this job re-drives
are equally best-effort on the mock settle path, so it must do real work in
mock mode too (see services/payout_links.py's own docstring for why).

Idempotent: every hook it re-drives is itself a CAS that no-ops on an
already-correct row, so re-running (or racing a real settle) can never
double-write. Bounded scan per tick (see _LINK_SCAN_LIMIT in the service).
"""

from __future__ import annotations

import logging
import time

from app.services import payout_links

logger = logging.getLogger("scheduler")


async def reconcile_payout_links() -> None:
    """Sweep and repair drifted payout links. Logs start / success / failure / duration."""
    started = time.monotonic()
    logger.info("job.reconcile_payout_links.start")
    try:
        summary = await payout_links.reconcile_payout_links()
    except Exception:
        logger.exception("job.reconcile_payout_links.failed")
        raise
    else:
        logger.info(
            "job.reconcile_payout_links.success scanned=%d repaired_paid=%d "
            "repaired_released=%d still_diverged=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("repaired_paid", 0),
            summary.get("repaired_released", 0),
            summary.get("still_diverged", 0),
            (time.monotonic() - started) * 1000,
        )
        if summary.get("still_diverged", 0):
            logger.warning(
                "job.reconcile_payout_links.still_diverged count=%d",
                summary["still_diverged"],
            )
