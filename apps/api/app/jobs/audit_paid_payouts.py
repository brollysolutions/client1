"""Audit recently-settled payouts for a post-payment reversal RazorpayX
reported but whose webhook was lost.

Closes the gap in services.payments.reconcile_stuck_payouts, which only scans
INITIATED/FAILED and never re-checks an already-PAID payout. A payout that
settles successfully and is reversed by RazorpayX days later (bank-side
rejection) is otherwise never discovered if the payout.reversed webhook
delivery is lost.

LIVE-ONLY by construction: services.payments.audit_paid_payouts_for_drift
returns immediately in mock mode, so on ``main``/dev this job is a logged
no-op. It only does real work on the ``prod`` branch.

Idempotent: reuses settle_from_webhook, which claims the PAID->REVERSED
transition with an atomic compare-and-swap, so re-running (or racing a real
webhook) can never double-emit a clawback row. Bounded scan per tick (see
_RECONCILE_SCAN_LIMIT in the service) over a trailing window (see
PAYOUT_REVERSAL_AUDIT_WINDOW_DAYS in config).
"""

from __future__ import annotations

import logging
import time

from app.services import payments

logger = logging.getLogger("scheduler")


async def audit_paid_payouts() -> None:
    """Sweep recently-PAID payouts for drift. Logs start / success / failure / duration."""
    started = time.monotonic()
    logger.info("job.audit_paid_payouts.start")
    try:
        summary = await payments.audit_paid_payouts_for_drift()
    except Exception:
        logger.exception("job.audit_paid_payouts.failed")
        raise
    else:
        logger.info(
            "job.audit_paid_payouts.success scanned=%d reconciled=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("reconciled", 0),
            (time.monotonic() - started) * 1000,
        )
