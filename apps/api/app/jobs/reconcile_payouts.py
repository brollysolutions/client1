"""Reconcile payouts stuck between our record and RazorpayX.

Closes the money-safety gap called out in services.payments.initiate_payout: if
a live RazorpayX POST succeeds server-side but the response is lost, the payout
is left INITIATED (webhook never matches) or FAILED with no gateway id — money
may have moved with no local ledger row. This job periodically asks RazorpayX
for the true state of stuck payouts and settles them through the idempotent
settle path.

LIVE-ONLY by construction: services.payments.reconcile_stuck_payouts returns
immediately in mock mode (empty RAZORPAY_* creds), so on `main`/dev this job is a
logged no-op with nothing to do. It only does real work on the `prod` branch.

Idempotent: it reuses settle_from_webhook, which no-ops on an already-settled
payout, so re-running (or racing a real webhook) can never double-emit a ledger
row. Bounded scan per tick (see _RECONCILE_SCAN_LIMIT in the service).
"""

from __future__ import annotations

import logging
import time

from app.services import payments

logger = logging.getLogger("scheduler")


async def reconcile_payouts() -> None:
    """Sweep and settle stuck live payouts. Logs start / success / failure / duration."""
    started = time.monotonic()
    logger.info("job.reconcile_payouts.start")
    try:
        summary = await payments.reconcile_stuck_payouts()
    except Exception:
        logger.exception("job.reconcile_payouts.failed")
        raise
    else:
        logger.info(
            "job.reconcile_payouts.success scanned=%d reconciled=%d duration_ms=%d",
            summary.get("scanned", 0),
            summary.get("reconciled", 0),
            (time.monotonic() - started) * 1000,
        )
