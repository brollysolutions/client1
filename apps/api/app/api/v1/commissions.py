"""Admin commission endpoints — entry against an eligible-deal queue,
oversight, and cancellation (FR-8.1/8.2, IDR v1.4 §5.5).

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
from app.models.commission import Commission, CommissionStatus
from app.models.payout import PayoutType
from app.schemas.commissions import (
    CommissionCancelRequest,
    CommissionCreate,
    CommissionListResponse,
    CommissionPayoutRequest,
    CommissionPayoutResponse,
    CommissionRead,
    EligibleDealListResponse,
)
from app.services import commissions
from app.services import payments as payments_service

router = APIRouter()

logger = logging.getLogger(__name__)

# Same typed-error -> HTTP mapping convention as api/v1/referrals.py's
# _ERROR_STATUS, duplicated rather than imported cross-router: the two
# surfaces are independent HTTP boundaries and only share the exception
# TYPES (from services.payments), not a router-to-router dependency.
_PAYOUT_ERROR_STATUS = {
    payments_service.RecipientNotFound: status.HTTP_404_NOT_FOUND,
    payments_service.RecipientInactive: status.HTTP_422_UNPROCESSABLE_CONTENT,
    payments_service.RecipientLineMismatch: status.HTTP_422_UNPROCESSABLE_CONTENT,
    payments_service.PayoutAmountExceeded: status.HTTP_422_UNPROCESSABLE_CONTENT,
    payments_service.PayoutDailyCapExceeded: status.HTTP_422_UNPROCESSABLE_CONTENT,
    payments_service.PayoutCapNotConfigured: status.HTTP_422_UNPROCESSABLE_CONTENT,
    payments_service.DuplicatePayout: status.HTTP_409_CONFLICT,
    payments_service.SelfPayoutForbidden: status.HTTP_403_FORBIDDEN,
    payments_service.GatewayError: status.HTTP_502_BAD_GATEWAY,
}


def _map_error(exc: commissions.CommissionError) -> HTTPException:
    if isinstance(exc, (commissions.DealNotFound, commissions.CommissionNotFound)):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, (commissions.DealNotEligible, commissions.CommissionAlreadyResolved)):
        code = status.HTTP_409_CONFLICT
    else:  # pragma: no cover — defensive default
        code = status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=code, detail=str(exc))


def _map_payout_error(exc: payments_service.PayoutError) -> HTTPException:
    code = _PAYOUT_ERROR_STATUS.get(type(exc), status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=code, detail=str(exc))


@router.get("/eligible", response_model=EligibleDealListResponse)
async def list_eligible(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> EligibleDealListResponse:
    await require_platform_admin(current_user)
    deals, total = await commissions.list_eligible_deals(db, limit=limit, offset=offset)
    return EligibleDealListResponse(deals=deals, total=total)


@router.post("", response_model=CommissionRead, status_code=status.HTTP_201_CREATED)
async def create_commission(
    payload: CommissionCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> CommissionRead:
    await require_platform_admin(current_user)
    try:
        commission = await commissions.create_commission(
            db,
            deal_type=payload.deal_type,
            deal_uuid=payload.deal_uuid,
            agreed_amount_paise=payload.agreed_amount_paise,
            notes=payload.notes,
            entered_by_uuid=current_user.id,
            entered_by_role=current_user.role,
        )
    except commissions.CommissionError as exc:
        raise _map_error(exc) from exc
    await db.commit()

    read = await commissions.get_for_admin(db, commission.id)
    if read is None:  # pragma: no cover — the row we just committed must read back
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Commission entry failed to read back."
        )
    return read


@router.get("", response_model=CommissionListResponse)
async def list_commissions(
    status_filter: CommissionStatus | None = None,
    business_line: Literal["loans", "real_estate"] | None = None,
    agent_profile_uuid: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> CommissionListResponse:
    await require_platform_admin(current_user)
    rows, total = await commissions.list_for_admin(
        db,
        status_filter=status_filter,
        business_line=business_line,
        agent_profile_uuid=agent_profile_uuid,
        limit=limit,
        offset=offset,
    )
    return CommissionListResponse(commissions=rows, total=total)


@router.post("/{commission_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_commission(
    commission_id: UUID,
    payload: CommissionCancelRequest,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_platform_admin(current_user)
    try:
        await commissions.cancel_commission(
            db,
            commission_id=commission_id,
            reason=payload.reason,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except commissions.CommissionError as exc:
        raise _map_error(exc) from exc
    await db.commit()


@router.post(
    "/{commission_id}/payout",
    response_model=CommissionPayoutResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_commission_payout(
    commission_id: UUID,
    req: CommissionPayoutRequest,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> CommissionPayoutResponse:
    """Turns one pending commission into a real payout. Amount and recipient
    come from the commission row, never from the request body — only the
    destination the agent actually receives money at is caller-supplied.
    Approval is a separate step at POST /payouts/{id}/approve: this endpoint
    is the maker, never the checker."""
    await require_platform_admin(current_user)

    commission = await db.get(Commission, commission_id)
    if commission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commission not found.")
    if commission.status != CommissionStatus.PENDING or commission.payout_uuid is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Commission is not awaiting payout.",
        )

    try:
        payout_id = await payments_service.create_payout(
            recipient_user_uuid=commission.agent_auth_user_uuid,
            payout_type=PayoutType.COMMISSION,
            business_line=commission.business_line,
            amount_paise=commission.agreed_amount_paise,
            destination_type=req.destination_type,
            destination=req.destination.model_dump(),
            # Deterministic, not client-supplied — see CommissionPayoutRequest's
            # docstring. Two concurrent creates for the SAME commission now
            # carry the SAME natural key, so create_payout's own dedupe guard
            # (or the partial-unique idempotency index on a genuine race)
            # rejects the second one before any orphan payout row can form.
            idempotency_key=f"com-{commission.id.hex}",
            maker_user_uuid=current_user.id,
        )
    except payments_service.PayoutError as exc:
        raise _map_payout_error(exc) from None

    attached = await commissions.attach_payout(commission_id=commission.id, payout_id=payout_id)
    if not attached:
        # Belt-and-suspenders: the deterministic key above should make this
        # branch unreachable for the concurrent-create race it guards
        # against, but if the commission stopped being pending for some other
        # reason between the read above and here, best-effort reject the
        # payout we just created rather than leave a live pending_approval
        # artifact with nothing pointing at it. Reject is not value-moving,
        # so this is safe even if the payout was somehow already approved by
        # the time we get here — that case raises PayoutStateError, swallowed
        # and logged for investigation, mirroring create_referral_payout.
        try:
            await payments_service.reject_payout(
                payout_id=payout_id,
                rejector_user_uuid=current_user.id,
                reason="Commission was claimed by another payout concurrently.",
                rejector_role=current_user.role,
            )
        except payments_service.PayoutError:
            logger.warning(
                "commissions.orphan_payout_reject_failed payout_id=%s commission_id=%s",
                payout_id,
                commission.id,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Commission was claimed by another payout concurrently.",
        )

    return CommissionPayoutResponse(payout_id=payout_id)
