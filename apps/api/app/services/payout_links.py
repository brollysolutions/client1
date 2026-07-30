"""Payout-linkage reconciliation (feature-status.md §2 #15).

A REFERRAL_BONUS/COMMISSION/CASHBACK payout's source row (referrals /
commissions / fee_cashbacks) hears about a paid or terminal-dead payout via
`apply_paid_link` / `apply_release_link` below — called by
`services/payments.py` right after each status-changing commit. Both the
dispatch and the three callees they fan out to
(`referrals.mark_paid_from_payout` / `.release_payout_link`,
`commissions.*`, `fee_cashbacks.*`) are best-effort: each callee wraps its
own write in `try/except Exception: logger.warning(...)` so a bug in one
ledger can never fail a payment settlement. That means a callee failure is
silent — the payout settles correctly but its source row is left stuck
`accrued`/`pending`, still carrying the payout's uuid, with no retry.

`reconcile_payout_links` is the sweep that catches that divergence, run on a
schedule (jobs/reconcile_payout_links.py) rather than trusted to fire once.
Two directions, independent per payout type:

  * PAID direction: the payout is PAID with a `ledger_transaction_id`, but
    the source row is still ACCRUED/PENDING — re-drive `apply_paid_link`.
    `ledger_transaction_id` is both the divergence predicate and the value
    the hook needs, which is why the missing `transactions -> payout`
    back-reference never matters here.
  * RELEASE direction: the payout is terminal-dead (rejected/failed/
    reversed) but the source row still carries its uuid — re-drive
    `apply_release_link`. The join alone is the divergence; release has no
    status precondition on the payout side, matching the callees' own
    `release_payout_link` shape (it matches on the payout uuid alone).

A third class — PAID with `ledger_transaction_id IS NULL` — is unreachable
under the current settle path (the ledger row is emitted, then the payout is
CAS-linked to it in the same commit) and is logged, never driven: calling
`apply_paid_link` with no transaction id would write a corrupt link.

Runs on a plain `AsyncSessionLocal()` session (app superuser, bypasses RLS)
via `import app.db.session as db_session` — resolved at call time, so this
module's tests get the NullPool test engine for free with no separate
conftest rebind entry, same convention as services/retention_purge.py and
services/commissions.py / fee_cashbacks.py / referrals.py's own payout-link
functions. A scheduler tick has no request identity (no `app.*` session
settings), so an RLS session would read zero rows regardless; the callees
already write on bypass sessions, so the scan must see the same row set the
write will see.

Idempotent by construction: the callees' own CAS predicates make a second
sweep over an already-repaired row a no-op (zero rows matched, zero writes).
The sweep additionally re-verifies each item after driving its hook (the
callees swallow exceptions and return None, so nothing else tells the sweep
whether a repair actually landed) and only counts a `repaired` id once the
divergence predicate no longer matches on a fresh read — under-claiming on a
crash between repair and re-check is safe (the next tick finds it again);
over-claiming never happens.

One `AuditAction.PAYOUT_LINK_RECONCILED` row per sweep that repaired
anything (never per-item — a steady-state sweep with nothing to do writes
no audit noise), written from the verified re-query, so — unlike
retention_purge.py's audit row, which shares its DELETEs' own transaction —
this one is necessarily written *after* the callees' own already-committed
writes. `detail` carries ids and counts only, per
services/audit_log.py::_assert_detail_is_safe.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

import app.db.session as db_session
from app.core.config import settings
from app.models.audit_log import AuditAction
from app.models.commission import Commission, CommissionStatus
from app.models.fee_cashback import FeeCashback, FeeCashbackStatus
from app.models.payout import Payout, PayoutStatus, PayoutType
from app.models.referral import Referral, ReferralStatus
from app.services import commissions, fee_cashbacks, referrals
from app.services.audit_log import record as record_audit

logger = logging.getLogger("scheduler")

_LINK_SCAN_LIMIT = 500
_TERMINAL_DEAD_STATUSES = (PayoutStatus.REJECTED, PayoutStatus.FAILED, PayoutStatus.REVERSED)


async def apply_paid_link(
    *, payout_type: PayoutType, payout_id: uuid.UUID, transaction_id: uuid.UUID
) -> None:
    """One dispatch table for the paid-settlement fan-out — payments.py's
    `_payout_paid_hook` becomes a one-line delegation to this. Moving the
    dispatch here (rather than leaving it in payments.py) is what lets this
    module and payments.py both call it without an import cycle: payments.py
    already imports commissions/fee_cashbacks/referrals directly, and none of
    those three import payments.py."""
    if payout_type == PayoutType.REFERRAL_BONUS:
        await referrals.mark_paid_from_payout(payout_id=payout_id, transaction_id=transaction_id)
    elif payout_type == PayoutType.COMMISSION:
        await commissions.mark_paid_from_payout(payout_id=payout_id, transaction_id=transaction_id)
    elif payout_type == PayoutType.CASHBACK:
        await fee_cashbacks.mark_paid_from_payout(
            payout_id=payout_id, transaction_id=transaction_id
        )


async def apply_release_link(*, payout_type: PayoutType, payout_id: uuid.UUID) -> None:
    """Symmetric release dispatch — payments.py's `_payout_released_hook`
    becomes a one-line delegation to this. Also the path account-deletion's
    in-flight-payout rejection (feature-status.md §2 #17) drives directly,
    since a payout rejected at deletion time never goes through
    payments.reject_payout's own hook call."""
    if payout_type == PayoutType.REFERRAL_BONUS:
        await referrals.release_payout_link(payout_id=payout_id)
    elif payout_type == PayoutType.COMMISSION:
        await commissions.release_payout_link(payout_id=payout_id)
    elif payout_type == PayoutType.CASHBACK:
        await fee_cashbacks.release_payout_link(payout_id=payout_id)


async def _grace_cutoff() -> datetime:
    return datetime.now(UTC) - timedelta(minutes=settings.PAYOUT_LINK_RECONCILE_GRACE_MINUTES)


async def _find_paid_divergences(
    session,
    payout_type: PayoutType,
    source_model,
    payout_uuid_col,
    status_col,
    status_value,
    cutoff: datetime,
) -> list[tuple[uuid.UUID, uuid.UUID]]:
    """Returns [(payout_id, transaction_id), ...] for payouts of this type
    that are PAID with a ledger transaction, whose source row is still
    unpaid. Paid-without-a-transaction-id is logged, never returned here —
    see module docstring."""
    stmt = (
        select(Payout.id, Payout.ledger_transaction_id)
        .join(source_model, payout_uuid_col == Payout.id)
        .where(
            Payout.type == payout_type,
            Payout.status == PayoutStatus.PAID,
            Payout.updated_at < cutoff,
            status_col == status_value,
        )
        .order_by(Payout.updated_at)
        .limit(_LINK_SCAN_LIMIT)
    )
    rows = (await session.execute(stmt)).all()
    divergences: list[tuple[uuid.UUID, uuid.UUID]] = []
    for payout_id, ledger_transaction_id in rows:
        if ledger_transaction_id is None:
            logger.warning("payout_link.paid_without_txn payout_id=%s", payout_id)
            continue
        divergences.append((payout_id, ledger_transaction_id))
    return divergences


async def _find_release_divergences(
    session, payout_type: PayoutType, source_model, payout_uuid_col, cutoff: datetime
) -> list[uuid.UUID]:
    """Returns payout ids of this type that are terminal-dead but whose
    source row still carries a link to them — the join alone is the
    divergence, matching release_payout_link's own unconditional-on-status
    match."""
    stmt = (
        select(Payout.id)
        .join(source_model, payout_uuid_col == Payout.id)
        .where(
            Payout.type == payout_type,
            Payout.status.in_(_TERMINAL_DEAD_STATUSES),
            Payout.updated_at < cutoff,
        )
        .order_by(Payout.updated_at)
        .limit(_LINK_SCAN_LIMIT)
    )
    return list((await session.scalars(stmt)).all())


async def _still_paid_diverged(
    session, source_model, payout_uuid_col, status_col, status_value, payout_id
) -> bool:
    return (
        await session.scalar(
            select(source_model.id).where(payout_uuid_col == payout_id, status_col == status_value)
        )
    ) is not None


async def _still_release_diverged(session, source_model, payout_uuid_col, payout_id) -> bool:
    return (
        await session.scalar(select(source_model.id).where(payout_uuid_col == payout_id))
    ) is not None


# (payout_type, source_model, payout_uuid_col, status_col, status_value) — the
# payout-uuid column name differs per table (Referral.reward_payout_uuid vs
# Commission/FeeCashback.payout_uuid), so it's carried explicitly rather than
# assumed uniform.
_SOURCES = (
    (
        PayoutType.REFERRAL_BONUS,
        Referral,
        Referral.reward_payout_uuid,
        Referral.conversion_status,
        ReferralStatus.ACCRUED,
    ),
    (
        PayoutType.COMMISSION,
        Commission,
        Commission.payout_uuid,
        Commission.status,
        CommissionStatus.PENDING,
    ),
    (
        PayoutType.CASHBACK,
        FeeCashback,
        FeeCashback.payout_uuid,
        FeeCashback.status,
        FeeCashbackStatus.PENDING,
    ),
)
_SOURCE_BY_TYPE = {
    payout_type: (source_model, payout_uuid_col, status_col, status_value)
    for payout_type, source_model, payout_uuid_col, status_col, status_value in _SOURCES
}


async def list_link_divergences(session) -> dict:
    """Read-only view of the same divergence set reconcile_payout_links
    scans, for the admin `GET /admin/payouts/link-divergences` endpoint. Runs
    on the CALLER's session (an RLS-scoped admin request session, not the
    bypass session the sweep itself uses) — deliberately no force-unlink
    endpoint exists (see module docstring's design note), so this is
    read-only and safe to run under ordinary RLS: an admin can see what is
    pending repair without being able to touch it directly."""
    cutoff = await _grace_cutoff()
    paid: list[dict] = []
    released: list[dict] = []
    for payout_type, source_model, payout_uuid_col, status_col, status_value in _SOURCES:
        for payout_id, _txn_id in await _find_paid_divergences(
            session, payout_type, source_model, payout_uuid_col, status_col, status_value, cutoff
        ):
            paid.append({"payout_id": payout_id, "payout_type": payout_type})
        release_ids = await _find_release_divergences(
            session, payout_type, source_model, payout_uuid_col, cutoff
        )
        for payout_id in release_ids:
            released.append({"payout_id": payout_id, "payout_type": payout_type})
    return {"paid_direction": paid, "release_direction": released}


async def reconcile_payout_links() -> dict:
    """Sweep every payout type for both divergence directions, re-drive the
    matching hook, and verify each repair before counting it. Deliberately
    NOT guarded on payments._is_live(): the paid/release hooks are equally
    best-effort on the mock settle path (services.payments._settle_paid),
    so this job must do real work in mock mode too — unlike
    reconcile_stuck_payouts/audit_paid_payouts_for_drift, which are live-only
    because they exist to correct against the gateway."""
    cutoff = await _grace_cutoff()
    scanned = 0
    repaired_paid: list[str] = []
    repaired_released: list[str] = []
    still_diverged: list[str] = []

    async with db_session.AsyncSessionLocal() as session:
        paid_work: list[tuple[PayoutType, uuid.UUID, uuid.UUID]] = []
        release_work: list[tuple[PayoutType, uuid.UUID]] = []
        for payout_type, source_model, payout_uuid_col, status_col, status_value in _SOURCES:
            paid = await _find_paid_divergences(
                session,
                payout_type,
                source_model,
                payout_uuid_col,
                status_col,
                status_value,
                cutoff,
            )
            scanned += len(paid)
            paid_work.extend((payout_type, pid, tid) for pid, tid in paid)

            released = await _find_release_divergences(
                session, payout_type, source_model, payout_uuid_col, cutoff
            )
            scanned += len(released)
            release_work.extend((payout_type, pid) for pid in released)

    for payout_type, payout_id, transaction_id in paid_work:
        await apply_paid_link(
            payout_type=payout_type, payout_id=payout_id, transaction_id=transaction_id
        )
        source_model, payout_uuid_col, status_col, status_value = _SOURCE_BY_TYPE[payout_type]
        async with db_session.AsyncSessionLocal() as check_session:
            diverged = await _still_paid_diverged(
                check_session, source_model, payout_uuid_col, status_col, status_value, payout_id
            )
        if diverged:
            still_diverged.append(str(payout_id))
            logger.warning("payout_link.still_diverged direction=paid payout_id=%s", payout_id)
        else:
            repaired_paid.append(str(payout_id))

    for payout_type, payout_id in release_work:
        await apply_release_link(payout_type=payout_type, payout_id=payout_id)
        source_model, payout_uuid_col, _status_col, _status_value = _SOURCE_BY_TYPE[payout_type]
        async with db_session.AsyncSessionLocal() as check_session:
            diverged = await _still_release_diverged(
                check_session, source_model, payout_uuid_col, payout_id
            )
        if diverged:
            still_diverged.append(str(payout_id))
            logger.warning("payout_link.still_diverged direction=release payout_id=%s", payout_id)
        else:
            repaired_released.append(str(payout_id))

    repaired = len(repaired_paid) + len(repaired_released)
    if repaired:
        async with db_session.AsyncSessionLocal() as audit_session:
            await record_audit(
                audit_session,
                action=AuditAction.PAYOUT_LINK_RECONCILED,
                entity_type="payout_links",
                entity_uuid=None,
                actor_uuid=None,
                actor_role=None,
                detail={
                    "scanned": scanned,
                    "repaired_paid": repaired_paid,
                    "repaired_released": repaired_released,
                    "still_diverged": still_diverged,
                },
            )
            await audit_session.commit()

    return {
        "scanned": scanned,
        "repaired_paid": len(repaired_paid),
        "repaired_released": len(repaired_released),
        "still_diverged": len(still_diverged),
    }
