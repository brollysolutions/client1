"""Referral bonus config — Sub Admin rule authoring + read-only payout oversight.

Every write runs on the request session under RLS (narrow sub_admin-only
allowlist — migration f9a0b1c2d3e4). Admin gets the list/detail GET routes
(read-only oversight); there is no bypass service, since there is no approval
step or status machine to guard (active is a plain toggle).

The payout-activity endpoint is read-only against `transactions`, filtered to
`transaction_type = 'referral_bonus'` in the query itself as well as relying on
that table's own RLS (e8f9a0b1c2d3 narrowed sub_admin's read there to exactly
this type). There is no write path into `transactions` from this router, or
from anywhere in this slice — payout execution stays Admin/finance's.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    CurrentUser,
    get_active_user,
    require_sub_admin_or_platform_admin,
)
from app.db.session import get_db
from app.models.referral_bonus_config import ReferralBonusConfig
from app.models.transaction import Transaction, TransactionType
from app.schemas.referral_bonus import (
    ReferralBonusConfigCreate,
    ReferralBonusConfigListResponse,
    ReferralBonusConfigRead,
    ReferralBonusConfigUpdate,
    ReferralPayoutActivityListResponse,
    ReferralPayoutActivityRead,
)
from app.services import referral_bonus as referral_bonus_service

router = APIRouter()


@router.post("", response_model=ReferralBonusConfigRead, status_code=status.HTTP_201_CREATED)
async def create_config(
    payload: ReferralBonusConfigCreate,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> ReferralBonusConfigRead:
    config = await referral_bonus_service.create_rule(
        db, current_user=current_user, payload=payload
    )
    return ReferralBonusConfigRead.model_validate(config, from_attributes=True)


@router.get("", response_model=ReferralBonusConfigListResponse)
async def list_configs(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> ReferralBonusConfigListResponse:
    # RLS scopes the rows: sub_admin and admin see the shared queue, anyone else
    # sees nothing. Newest first.
    stmt = select(ReferralBonusConfig).order_by(ReferralBonusConfig.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    referenced_ids = await referral_bonus_service.referenced_rule_ids(
        [config.id for config in rows]
    )
    return ReferralBonusConfigListResponse(
        configs=[
            ReferralBonusConfigRead.model_validate(config, from_attributes=True).model_copy(
                update={"is_referenced": config.id in referenced_ids}
            )
            for config in rows
        ]
    )


@router.get("/{config_id:uuid}", response_model=ReferralBonusConfigRead)
async def get_config(
    config_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> ReferralBonusConfigRead:
    config = await db.scalar(select(ReferralBonusConfig).where(ReferralBonusConfig.id == config_id))
    if config is None:
        # 404, never 403: an RLS-filtered row is indistinguishable from missing.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Referral bonus config not found."
        )
    referenced = await referral_bonus_service.is_referenced(config.id)
    return ReferralBonusConfigRead.model_validate(config, from_attributes=True).model_copy(
        update={"is_referenced": referenced}
    )


@router.patch("/{config_id:uuid}", response_model=ReferralBonusConfigRead)
async def update_config(
    config_id: UUID,
    payload: ReferralBonusConfigUpdate,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> ReferralBonusConfigRead:
    config = await referral_bonus_service.update_rule(
        db, current_user=current_user, config_id=config_id, payload=payload
    )
    referenced = await referral_bonus_service.is_referenced(config.id)
    return ReferralBonusConfigRead.model_validate(config, from_attributes=True).model_copy(
        update={"is_referenced": referenced}
    )


@router.delete("/{config_id:uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    await referral_bonus_service.delete_rule(db, current_user=current_user, config_id=config_id)


@router.get("/payout-activity/recent", response_model=ReferralPayoutActivityListResponse)
async def payout_activity(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> ReferralPayoutActivityListResponse:
    # App-layer gate on top of transactions_rls: without this, a plain client
    # or agent hitting this staff-oversight route would still get their OWN
    # referral_bonus rows back (transactions_rls's owner branch is
    # unconditional on role) — not a cross-tenant leak, but a contract
    # mismatch against this route's staff-oversight purpose. 403 up front
    # instead of a confusing empty/partial oversight view.
    if current_user.role not in ("sub_admin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Sub Admin or Admin may view referral payout activity.",
        )
    # Filtered in the query as well as relying on transactions_rls's own
    # narrowing (e8f9a0b1c2d3) — defence in depth, and it keeps this endpoint
    # correct if that policy is ever widened.
    stmt = (
        select(Transaction)
        .where(Transaction.type == TransactionType.REFERRAL_BONUS)
        .order_by(Transaction.created_at.desc())
        .limit(50)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return ReferralPayoutActivityListResponse(
        activity=[ReferralPayoutActivityRead.model_validate(r, from_attributes=True) for r in rows]
    )
