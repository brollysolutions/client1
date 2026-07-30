"""Admin fee-cashback endpoints — entry against an eligible-application
queue, oversight, cancellation, and payout execution (FR-6.6).

Gated by `deps.require_platform_admin` (feature-status.md §2-20), not the
role-only `deps.require_admin`: every RLS admin-bypass predicate in this
codebase is `role='admin' AND platform_scope='true'`. A line-scoped admin
who passed a role-only guard would get either a 403 further down or a
silently-empty result, neither of which is a substitute for a real 403 at
the boundary.
"""

from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user, require_platform_admin
from app.db.session import get_db
from app.models.fee_cashback import FeeCashback, FeeCashbackStatus
from app.models.payout import PayoutType
from app.schemas.fee_cashbacks import (
    EligibleFeeApplicationListResponse,
    FeeCashbackCancelRequest,
    FeeCashbackCreate,
    FeeCashbackListResponse,
    FeeCashbackPayoutRequest,
    FeeCashbackPayoutResponse,
    FeeCashbackRead,
)
from app.services import fee_cashbacks
from app.services import payments as payments_service

router = APIRouter()

logger = logging.getLogger(__name__)

# Same typed-error -> HTTP mapping convention as api/v1/commissions.py's
# _PAYOUT_ERROR_STATUS, duplicated rather than imported cross-router: the two
# surfaces are independent HTTP boundaries and only share the exception
# TYPES (from services.payments), not a router-to-router dependency.
_PAYOUT_ERROR_STATUS = {
    payments_service.RecipientNotFound: status.HTTP_404_NOT_FOUND,
    payments_service.RecipientInactive: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.RecipientLineMismatch: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.PayoutAmountExceeded: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.PayoutDailyCapExceeded: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.PayoutCapNotConfigured: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.DuplicatePayout: status.HTTP_409_CONFLICT,
    payments_service.SelfPayoutForbidden: status.HTTP_403_FORBIDDEN,
    payments_service.GatewayError: status.HTTP_502_BAD_GATEWAY,
}


def _map_error(exc: fee_cashbacks.FeeCashbackError) -> HTTPException:
    if isinstance(exc, (fee_cashbacks.ApplicationNotFound, fee_cashbacks.FeeCashbackNotFound)):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(
        exc, (fee_cashbacks.ApplicationNotEligible, fee_cashbacks.FeeCashbackAlreadyResolved)
    ):
        code = status.HTTP_409_CONFLICT
    else:  # pragma: no cover — defensive default
        code = status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=code, detail=str(exc))


def _map_payout_error(exc: payments_service.PayoutError) -> HTTPException:
    code = _PAYOUT_ERROR_STATUS.get(type(exc), status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=code, detail=str(exc))


@router.get("/eligible", response_model=EligibleFeeApplicationListResponse)
async def list_eligible(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> EligibleFeeApplicationListResponse:
    await require_platform_admin(current_user)
    applications, total = await fee_cashbacks.list_eligible_applications(
        db, limit=limit, offset=offset
    )
    return EligibleFeeApplicationListResponse(applications=applications, total=total)


@router.post("", response_model=FeeCashbackRead, status_code=status.HTTP_201_CREATED)
async def create_fee_cashback(
    payload: FeeCashbackCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> FeeCashbackRead:
    await require_platform_admin(current_user)
    try:
        cashback = await fee_cashbacks.create_fee_cashback(
            db,
            loan_application_uuid=payload.loan_application_uuid,
            amount_paise=payload.amount_paise,
            notes=payload.notes,
            entered_by_uuid=current_user.id,
            entered_by_role=current_user.role,
        )
    except fee_cashbacks.FeeCashbackError as exc:
        raise _map_error(exc) from exc
    await db.commit()

    read = await fee_cashbacks.get_for_admin(db, cashback.id)
    if read is None:  # pragma: no cover — the row we just committed must read back
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Fee-cashback entry failed to read back."
        )
    return read


@router.get("", response_model=FeeCashbackListResponse)
async def list_fee_cashbacks(
    status_filter: FeeCashbackStatus | None = None,
    business_line: Literal["loans", "real_estate"] | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> FeeCashbackListResponse:
    await require_platform_admin(current_user)
    rows, total = await fee_cashbacks.list_for_admin(
        db,
        status_filter=status_filter,
        business_line=business_line,
        limit=limit,
        offset=offset,
    )
    return FeeCashbackListResponse(cashbacks=rows, total=total)


@router.post("/{cashback_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_fee_cashback(
    cashback_id: UUID,
    payload: FeeCashbackCancelRequest,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_platform_admin(current_user)
    try:
        await fee_cashbacks.cancel_fee_cashback(
            db,
            cashback_id=cashback_id,
            reason=payload.reason,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except fee_cashbacks.FeeCashbackError as exc:
        raise _map_error(exc) from exc
    await db.commit()


@router.post(
    "/{cashback_id}/payout",
    response_model=FeeCashbackPayoutResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_fee_cashback_payout(
    cashback_id: UUID,
    req: FeeCashbackPayoutRequest,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> FeeCashbackPayoutResponse:
    """Turns one pending cashback into a real payout. Amount and recipient
    come from the cashback row, never from the request body — only the
    destination the client actually receives money at is caller-supplied.
    Approval is a separate step at POST /payouts/{id}/approve: this endpoint
    is the maker, never the checker."""
    await require_platform_admin(current_user)

    cashback = await db.get(FeeCashback, cashback_id)
    if cashback is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee cashback not found.")
    if cashback.status != FeeCashbackStatus.PENDING or cashback.payout_uuid is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Fee cashback is not awaiting payout.",
        )

    try:
        payout_id = await payments_service.create_payout(
            recipient_user_uuid=cashback.recipient_auth_user_uuid,
            payout_type=PayoutType.CASHBACK,
            business_line=cashback.business_line,
            amount_paise=cashback.amount_paise,
            destination_type=req.destination_type,
            destination=req.destination.model_dump(),
            # Deterministic, not client-supplied — see FeeCashbackPayoutRequest's
            # docstring. Two concurrent creates for the SAME cashback now
            # carry the SAME natural key, so create_payout's own dedupe guard
            # rejects the second one before any orphan payout row can form.
            idempotency_key=f"fcb-{cashback.id.hex}",
            maker_user_uuid=current_user.id,
        )
    except payments_service.PayoutError as exc:
        raise _map_payout_error(exc) from None

    attached = await fee_cashbacks.attach_payout(cashback_id=cashback.id, payout_id=payout_id)
    if not attached:
        # Belt-and-suspenders: the deterministic key above should make this
        # branch unreachable for the concurrent-create race it guards
        # against, but if the cashback stopped being pending for some other
        # reason between the read above and here, best-effort reject the
        # payout we just created rather than leave a live pending_approval
        # artifact with nothing pointing at it.
        try:
            await payments_service.reject_payout(
                payout_id=payout_id,
                rejector_user_uuid=current_user.id,
                reason="Fee cashback was claimed by another payout concurrently.",
                rejector_role=current_user.role,
            )
        except payments_service.PayoutError:
            logger.warning(
                "fee_cashbacks.orphan_payout_reject_failed payout_id=%s cashback_id=%s",
                payout_id,
                cashback.id,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Fee cashback was claimed by another payout concurrently.",
        )

    return FeeCashbackPayoutResponse(payout_id=payout_id)
