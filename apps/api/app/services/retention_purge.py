"""7-year retention purge (SRS 5.1) — the second half of account deletion.

`services/account_deletion.py` de-links `transactions`/`payouts` from a deleted
identity (nulls the owning FK, stamps `retained_ref` + `delinked_at`) but never
erases the rows themselves — SRS 5.1 requires retaining financial records for
7 years, just not against the deleted person's own identity. This job is the
other end of that retention window: once `delinked_at` is old enough, the row
itself is purged. `delinked_at` is the anchor, never `created_at` — a
long-lived active account's transactions are never touched, no matter how old.

Two independent FK hazards, both handled before the DELETEs:

1. Deletion order: `payouts.ledger_transaction_id` / `payouts.reversal_transaction_id`
   are FKs to `transactions.id` with no `ondelete` (default RESTRICT). A payout
   and the ledger transaction it emitted share the same recipient and get
   delinked together by the same `delete_account` call, so within one purge
   run payouts must be deleted BEFORE transactions — otherwise a
   still-referenced transaction would fail to delete. No payout ever
   references another identity's transaction, so this ordering alone is
   sufficient for this hazard.
2. External references: `referrals.reward_payout_uuid` / `referrals.reward_txn_uuid`
   (also FKs with no `ondelete`) point AT a payout/transaction from an entirely
   different table that `account_deletion.py` never touches — a referral row
   is a permanent business record, not something de-linked or purged itself.
   Left alone, these would block the purge forever (a `referrals` row survives
   indefinitely) rather than merely reordering it, unlike hazard 1. Unlinking
   first is safe: `referrals.bonus_amount_paise` already denormalizes the
   reward amount, so nulling the FK loses no business data — the same
   "de-link, don't erase the record" shape `account_deletion.py` itself uses.

Runs on a plain AsyncSessionLocal() session (app superuser, bypasses RLS) via
`import app.db.session as db_session` -- resolved at call time, NOT
`from app.db.session import AsyncSessionLocal` at module level, so this job's
tests get the NullPool test engine for free (same convention as
cms_activation.py / prune_expired_refresh_tokens — see cms_activation.py's
docstring for why).

Idempotent by construction: a rerun finds nothing left older than the cutoff.

No `audit_log` table exists yet in this codebase (feature-status.md §3.3) for
this irreversible hard DELETE, so `purge_delinked_financial_records` returns
the purged row ids (+ `retained_ref`, itself not PII — the former identity's
already-tombstoned auth_users.id) alongside the counts; the job logs them so
the purge is reconstructable from log retention even without a dedicated table.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update

import app.db.session as db_session
from app.core.config import settings
from app.models.payout import Payout
from app.models.referral import Referral
from app.models.transaction import Transaction


def _retention_cutoff(now: datetime, years: int) -> datetime:
    # Actual calendar years, not a 365-day approximation: a compliance
    # retention window must never purge a record short of the real 7 years
    # (rounding short would purge early; 365*years drifts short by ~1-2 days
    # per 7-year window from leap days). Falls back to Feb 28 only when `now`
    # itself is a Feb 29 with no matching leap day `years` back.
    try:
        return now.replace(year=now.year - years)
    except ValueError:
        return now.replace(month=2, day=28, year=now.year - years)


async def purge_delinked_financial_records(*, retention_years: int | None = None) -> dict:
    if retention_years is not None:
        years = retention_years
    else:
        years = settings.FINANCIAL_RECORD_RETENTION_YEARS
    cutoff = _retention_cutoff(datetime.now(UTC), years)

    async with db_session.AsyncSessionLocal() as session:
        payouts_scanned = await session.scalar(
            select(func.count()).select_from(Payout).where(Payout.delinked_at.is_not(None))
        )
        purge_payout_ids = select(Payout.id).where(
            Payout.delinked_at.is_not(None), Payout.delinked_at < cutoff
        )
        await session.execute(
            update(Referral)
            .where(Referral.reward_payout_uuid.in_(purge_payout_ids))
            .values(reward_payout_uuid=None)
        )
        payouts_purged_rows = (
            await session.execute(
                delete(Payout)
                .where(Payout.delinked_at.is_not(None), Payout.delinked_at < cutoff)
                .returning(Payout.id, Payout.retained_ref)
                .execution_options(synchronize_session=False)
            )
        ).all()

        transactions_scanned = await session.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.delinked_at.is_not(None))
        )
        purge_transaction_ids = select(Transaction.id).where(
            Transaction.delinked_at.is_not(None), Transaction.delinked_at < cutoff
        )
        await session.execute(
            update(Referral)
            .where(Referral.reward_txn_uuid.in_(purge_transaction_ids))
            .values(reward_txn_uuid=None)
        )
        transactions_purged_rows = (
            await session.execute(
                delete(Transaction)
                .where(Transaction.delinked_at.is_not(None), Transaction.delinked_at < cutoff)
                .returning(Transaction.id, Transaction.retained_ref)
                .execution_options(synchronize_session=False)
            )
        ).all()
        await session.commit()

    return {
        "payouts_scanned": payouts_scanned or 0,
        "payouts_purged": len(payouts_purged_rows),
        "payouts_purged_ids": [(str(row.id), row.retained_ref) for row in payouts_purged_rows],
        "transactions_scanned": transactions_scanned or 0,
        "transactions_purged": len(transactions_purged_rows),
        "transactions_purged_ids": [
            (str(row.id), row.retained_ref) for row in transactions_purged_rows
        ],
    }
