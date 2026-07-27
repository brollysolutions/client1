"""Referral endpoints — a client's own code + conversion tracking. Read-only.

No role guard beyond authentication: eligibility (FR-9.1, client-only) is
resolved inside services.referrals and reflected in the response body
(`eligible` / `ineligible_reason`), not by rejecting the request — an agent
calling GET /me should see why they have no code, not a 403. RLS scopes
GET / to the caller's own rows regardless (same trust-RLS stance as
api/v1/transactions.py).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.core.masking import mask_mobile
from app.db.session import get_db
from app.schemas.referrals import MyReferralResponse, ReferralListResponse, ReferralRead
from app.services import referrals

router = APIRouter()


@router.get("/me", response_model=MyReferralResponse)
async def get_my_referral(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> MyReferralResponse:
    return await referrals.get_my_referral(db, current_user.id)


@router.get("", response_model=ReferralListResponse)
async def list_referrals(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> ReferralListResponse:
    rows = await referrals.list_referrals(db)
    return ReferralListResponse(
        referrals=[
            ReferralRead(
                id=r.id,
                referred_mobile_masked=mask_mobile(r.referred_mobile),
                business_line=r.business_line,
                conversion_status=r.conversion_status.value,
                bonus_amount_paise=r.bonus_amount_paise,
                converted_at=r.converted_at,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )
