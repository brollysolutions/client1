"""Processing-fee cashback — Admin entry against an eligible-application
queue, oversight, and payout execution (FR-6.6).

All admin functions here run on the CALLER's request-scoped session, not a
bypass session: `fee_cashbacks_insert`/`fee_cashbacks_update` RLS requires
`role='admin' AND platform_scope='true'`, the same context the router's
`_require_admin` gate already asserts, so trusting RLS is correct here —
same convention as `services/commissions.py`.

The eligible-application queue is a CONVENIENCE, not the control:
`create_fee_cashback` re-validates all four eligibility conjuncts itself. An
application that dropped off the queue between page-load and submit still
gets a clean 404/409 instead of an admin fighting a stale list.

Must not import services.payments — payments imports this module (the
_payout_paid_hook / _payout_released_hook dispatch). The router owns the
payout call, exactly as api/v1/commissions.py does.
"""

from __future__ import annotations

import logging
import uuid
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.models.fee_cashback import FeeCashback, FeeCashbackStatus
from app.models.loan import FeeOutcome, LoanApplication
from app.models.profile import ClientProfile
from app.models.user import User
from app.schemas.fee_cashbacks import EligibleFeeApplication, FeeCashbackRead
from app.services import audit_log
from app.services.audit_log import AuditAction

logger = logging.getLogger(__name__)

_SUBQUERY_CAP = 200


class FeeCashbackError(Exception):
    """Base for fee-cashback service errors; the router maps subclasses to HTTP."""


class ApplicationNotFound(FeeCashbackError):
    pass


class ApplicationNotEligible(FeeCashbackError):
    """Application is not disbursed, its fee_outcome is not 'cashback', its
    processing_fee is not positive, or it already carries a live
    (non-cancelled) cashback."""


class FeeCashbackNotFound(FeeCashbackError):
    pass


class FeeCashbackAlreadyResolved(FeeCashbackError):
    """Cancel attempted on a cashback that is no longer pending, or already
    has a payout attached."""


def _name_expr(user_model):
    full_name = func.concat_ws(" ", user_model.first_name, user_model.last_name)
    return func.nullif(func.trim(full_name), "")


def _to_paise(fee: Decimal) -> int:
    """processing_fee is NUMERIC(14,2) rupees; the multiply by 100 is exact
    (no rounding loss is possible at that scale). ROUND_HALF_UP is defensive
    only — quantize never actually rounds for a two-decimal-place input."""
    return int((fee * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


async def list_eligible_applications(
    db: AsyncSession, *, limit: int = 50, offset: int = 0
) -> tuple[list[EligibleFeeApplication], int]:
    """Disbursed loan applications with fee_outcome='cashback', a positive
    processing_fee, and no live (non-cancelled) cashback row yet,
    newest-first. Single-source (unlike commissions' loan+property merge),
    but capped the same way for consistency and to bound the query."""
    stmt = (
        select(
            LoanApplication.id.label("loan_application_uuid"),
            LoanApplication.business_line,
            LoanApplication.client_profile_uuid,
            _name_expr(User).label("client_name"),
            LoanApplication.processing_fee,
            LoanApplication.disbursed_at.label("eligible_since"),
        )
        .join(ClientProfile, ClientProfile.id == LoanApplication.client_profile_uuid)
        .join(User, User.id == ClientProfile.auth_user_uuid)
        .where(
            # disbursed_at IS NOT NULL, not status == DISBURSED: DISBURSED
            # isn't terminal, so a loan that has since moved on to CLOSED
            # must stay eligible — see disbursed_at's column docstring in
            # models/loan.py, and services/commissions.py's identical choice.
            LoanApplication.disbursed_at.is_not(None),
            LoanApplication.fee_outcome == FeeOutcome.CASHBACK,
            LoanApplication.processing_fee.is_not(None),
            LoanApplication.processing_fee > 0,
            ~select(FeeCashback.id)
            .where(
                FeeCashback.loan_application_uuid == LoanApplication.id,
                FeeCashback.status != FeeCashbackStatus.CANCELLED,
            )
            .exists(),
        )
        .order_by(LoanApplication.disbursed_at.desc().nulls_last())
        .limit(_SUBQUERY_CAP)
    )
    rows = (await db.execute(stmt)).all()

    applications = [
        EligibleFeeApplication(
            loan_application_uuid=r.loan_application_uuid,
            business_line=r.business_line,
            client_profile_uuid=r.client_profile_uuid,
            client_name=r.client_name,
            processing_fee_paise=_to_paise(Decimal(str(r.processing_fee))),
            eligible_since=r.eligible_since,
        )
        for r in rows
    ]
    total = len(applications)
    return applications[offset : offset + limit], total


async def create_fee_cashback(
    db: AsyncSession,
    *,
    loan_application_uuid: uuid.UUID,
    amount_paise: int,
    notes: str | None,
    entered_by_uuid: uuid.UUID,
    entered_by_role: str,
) -> FeeCashback:
    """Derives client/recipient/line/fee snapshot from the loan-application
    row — never from the request body — then inserts the cashback and writes
    the audit entry in the same transaction (the router commits)."""
    application = await db.get(LoanApplication, loan_application_uuid)
    if application is None:
        raise ApplicationNotFound("Loan application not found.")
    if application.disbursed_at is None:
        raise ApplicationNotEligible("Loan application has never been disbursed.")
    if application.fee_outcome != FeeOutcome.CASHBACK:
        raise ApplicationNotEligible("Loan application's fee outcome is not 'cashback'.")
    if application.processing_fee is None or application.processing_fee <= 0:
        raise ApplicationNotEligible("Loan application has no positive processing fee.")

    client_profile = await db.get(ClientProfile, application.client_profile_uuid)
    if client_profile is None:
        raise ApplicationNotEligible("Client profile no longer exists.")

    processing_fee_paise = _to_paise(Decimal(str(application.processing_fee)))
    if amount_paise > processing_fee_paise:
        raise ApplicationNotEligible("Cashback amount cannot exceed the processing fee.")

    cashback = FeeCashback(
        loan_application_uuid=application.id,
        client_profile_uuid=client_profile.id,
        recipient_auth_user_uuid=client_profile.auth_user_uuid,
        business_line=application.business_line,
        processing_fee_paise=processing_fee_paise,
        amount_paise=amount_paise,
        entered_by_uuid=entered_by_uuid,
        notes=notes,
    )
    db.add(cashback)
    try:
        await db.flush()
    except IntegrityError as exc:
        # The partial-unique index is the authoritative double-entry guard
        # (a concurrent second entry on the same application loses the race
        # here); the eligibility query above is only the convenience.
        raise ApplicationNotEligible(
            "A live cashback already exists for this loan application."
        ) from exc

    await audit_log.record(
        db,
        action=AuditAction.FEE_CASHBACK_ENTERED,
        entity_type="fee_cashback",
        entity_uuid=cashback.id,
        actor_uuid=entered_by_uuid,
        actor_role=entered_by_role,
        business_line=application.business_line,
        detail={
            "loan_application_uuid": str(loan_application_uuid),
            "amount_paise": amount_paise,
        },
    )
    return cashback


async def cancel_fee_cashback(
    db: AsyncSession,
    *,
    cashback_id: uuid.UUID,
    reason: str,
    actor_uuid: uuid.UUID,
    actor_role: str,
) -> None:
    """pending -> cancelled, CAS-guarded. Blocked once a payout is attached —
    cancelling a cashback that already has money moving against it is a
    payout-side decision (reject the payout), not a ledger edit."""
    result = await db.execute(
        update(FeeCashback)
        .where(
            FeeCashback.id == cashback_id,
            FeeCashback.status == FeeCashbackStatus.PENDING,
            FeeCashback.payout_uuid.is_(None),
        )
        .values(status=FeeCashbackStatus.CANCELLED, cancelled_reason=reason)
        .returning(FeeCashback.business_line)
    )
    row = result.first()
    if row is None:
        existing = await db.get(FeeCashback, cashback_id)
        if existing is None:
            raise FeeCashbackNotFound("Fee cashback not found.")
        raise FeeCashbackAlreadyResolved(
            "Fee cashback is not pending or already has a payout attached."
        )

    await audit_log.record(
        db,
        action=AuditAction.FEE_CASHBACK_CANCELLED,
        entity_type="fee_cashback",
        entity_uuid=cashback_id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=row.business_line,
        detail={"reason": reason},
    )


def _row_to_read(cashback: FeeCashback, client_name: str | None) -> FeeCashbackRead:
    return FeeCashbackRead(
        id=cashback.id,
        loan_application_uuid=cashback.loan_application_uuid,
        client_profile_uuid=cashback.client_profile_uuid,
        client_name=client_name,
        business_line=cashback.business_line,
        processing_fee_paise=cashback.processing_fee_paise,
        amount_paise=cashback.amount_paise,
        status=cashback.status,
        payout_uuid=cashback.payout_uuid,
        notes=cashback.notes,
        cancelled_reason=cashback.cancelled_reason,
        created_at=cashback.created_at,
        updated_at=cashback.updated_at,
    )


async def list_for_admin(
    db: AsyncSession,
    *,
    status_filter: FeeCashbackStatus | None = None,
    business_line: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[FeeCashbackRead], int]:
    """Admin oversight read. Runs on the caller's request session — RLS's
    full-Admin branch already grants unfiltered reach, same trust-RLS
    convention as list_eligible_applications / commissions.list_for_admin."""
    filters = []
    if status_filter is not None:
        filters.append(FeeCashback.status == status_filter)
    if business_line is not None:
        filters.append(FeeCashback.business_line == business_line)

    total = await db.scalar(select(func.count()).select_from(FeeCashback).where(*filters)) or 0

    stmt = (
        select(FeeCashback, _name_expr(User).label("client_name"))
        .join(ClientProfile, ClientProfile.id == FeeCashback.client_profile_uuid)
        .join(User, User.id == ClientProfile.auth_user_uuid)
        .where(*filters)
        .order_by(FeeCashback.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).all()
    return [_row_to_read(c, name) for c, name in rows], total


async def get_for_admin(db: AsyncSession, cashback_id: uuid.UUID) -> FeeCashbackRead | None:
    """Single-row read-back, same projection as list_for_admin — used right
    after create_fee_cashback so the response carries client_name without
    duplicating the join logic."""
    stmt = (
        select(FeeCashback, _name_expr(User).label("client_name"))
        .join(ClientProfile, ClientProfile.id == FeeCashback.client_profile_uuid)
        .join(User, User.id == ClientProfile.auth_user_uuid)
        .where(FeeCashback.id == cashback_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    cashback, client_name = row
    return _row_to_read(cashback, client_name)


# ---------------------------------------------------------------------------
# Payout execution — turning a pending cashback into a real payout
# ---------------------------------------------------------------------------
#
# The three functions below run on the BYPASS session (db_session.AsyncSessionLocal,
# module-qualified access — not `from ... import AsyncSessionLocal`, so conftest's
# NullPool patch of the module attribute is picked up automatically with no
# separate _patch_db_null_pool entry needed), mirroring
# services/commissions.py::attach_payout / mark_paid_from_payout /
# release_payout_link exactly: services/payments.py calls these from contexts
# with no admin JWT session at all (the auth-less webhook receiver, a
# scheduler-driven reconcile job), so they cannot depend on
# fee_cashbacks_update RLS, which requires an admin request context.


async def attach_payout(*, cashback_id: uuid.UUID, payout_id: uuid.UUID) -> bool:
    """Links a newly-created payout to a pending, unlinked cashback.

    The CAS (WHERE status='pending' AND payout_uuid IS NULL) is the
    double-pay guard: two concurrent "Pay cashback" clicks can only ever have
    one winner. A False return means the row was already claimed (or is no
    longer pending) — the router turns that into a 409. The payout itself is
    NOT rolled back here; it is left pending_approval for a human to reject.
    """
    async with db_session.AsyncSessionLocal() as session:
        result = await session.execute(
            update(FeeCashback)
            .where(
                FeeCashback.id == cashback_id,
                FeeCashback.status == FeeCashbackStatus.PENDING,
                FeeCashback.payout_uuid.is_(None),
            )
            .values(payout_uuid=payout_id, updated_at=func.now())
            .returning(FeeCashback.id)
        )
        claimed = result.scalar_one_or_none()
        await session.commit()
        return claimed is not None


async def mark_paid_from_payout(*, payout_id: uuid.UUID, transaction_id: uuid.UUID) -> None:
    """Called by services.payments once a CASHBACK payout settles to PAID
    (mock-path settle and the webhook settle path both call this).

    Best-effort: swallows every error so a cashback-ledger bug can never fail
    a payment settlement, same discipline as commissions.mark_paid_from_payout.
    The CAS (WHERE status='pending') makes a redelivered settle a no-op, and a
    manually-created unlinked CASHBACK payout (payout-form.ts already offers
    the type in the admin manual-payout picker) updates zero rows here —
    safe, not an error.
    """
    try:
        async with db_session.AsyncSessionLocal() as session:
            await session.execute(
                update(FeeCashback)
                .where(
                    FeeCashback.payout_uuid == payout_id,
                    FeeCashback.status == FeeCashbackStatus.PENDING,
                )
                .values(
                    status=FeeCashbackStatus.PAID,
                    payout_txn_uuid=transaction_id,
                    updated_at=func.now(),
                )
            )
            await session.commit()
    except Exception:
        logger.warning("fee_cashbacks.mark_paid_failed payout_id=%s", payout_id, exc_info=True)


async def release_payout_link(*, payout_id: uuid.UUID) -> None:
    """Called by services.payments when a CASHBACK payout lands on a terminal
    non-paid status (failed, rejected, or reversed after having been paid).
    Frees the cashback row so Admin can pay it again: back to pending, both
    payout uuids cleared.

    Matches on payout_uuid alone (not a status filter) so it correctly
    unwinds both a payout that never reached paid and a post-settlement
    reversal in one shared path. Idempotent: a row with no matching
    payout_uuid (already released, never linked, or an unrelated manually
    created payout) updates zero rows. Best-effort, same discipline as
    mark_paid_from_payout.
    """
    try:
        async with db_session.AsyncSessionLocal() as session:
            await session.execute(
                update(FeeCashback)
                .where(FeeCashback.payout_uuid == payout_id)
                .values(
                    status=FeeCashbackStatus.PENDING,
                    payout_uuid=None,
                    payout_txn_uuid=None,
                    updated_at=func.now(),
                )
            )
            await session.commit()
    except Exception:
        logger.warning(
            "fee_cashbacks.release_payout_link_failed payout_id=%s", payout_id, exc_info=True
        )
