"""Admin commission endpoints — entry against an eligible-deal queue,
oversight, and cancellation (FR-8.1/8.2, IDR v1.4 §5.5).

_require_admin checks platform_scope in addition to role, copied verbatim
from api/v1/referrals.py — every RLS admin-bypass predicate in this codebase
is `role='admin' AND platform_scope='true'`, and `deps.require_admin` checks
role only. A line-scoped admin who passed the weaker guard would get either a
403 further down or a silently-empty result, neither of which is a substitute
for a real 403 at the boundary.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.commission import CommissionStatus
from app.schemas.commissions import (
    CommissionCancelRequest,
    CommissionCreate,
    CommissionListResponse,
    CommissionRead,
    EligibleDealListResponse,
)
from app.services import commissions

router = APIRouter()


def _require_admin(current_user: CurrentUser) -> None:
    if current_user.role != "admin" or current_user.platform_scope != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Commission entry is restricted to platform admins.",
        )


def _map_error(exc: commissions.CommissionError) -> HTTPException:
    if isinstance(exc, (commissions.DealNotFound, commissions.CommissionNotFound)):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, (commissions.DealNotEligible, commissions.CommissionAlreadyResolved)):
        code = status.HTTP_409_CONFLICT
    else:  # pragma: no cover — defensive default
        code = status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=code, detail=str(exc))


@router.get("/eligible", response_model=EligibleDealListResponse)
async def list_eligible(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> EligibleDealListResponse:
    _require_admin(current_user)
    deals, total = await commissions.list_eligible_deals(db, limit=limit, offset=offset)
    return EligibleDealListResponse(deals=deals, total=total)


@router.post("", response_model=CommissionRead, status_code=status.HTTP_201_CREATED)
async def create_commission(
    payload: CommissionCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> CommissionRead:
    _require_admin(current_user)
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
    _require_admin(current_user)
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
    _require_admin(current_user)
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
