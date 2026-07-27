"""Referral endpoints.

GET /me and GET "" are a client's own code + conversion tracking, read-only.
No role guard beyond authentication: eligibility (FR-9.1, client-only) is
resolved inside services.referrals and reflected in the response body
(`eligible` / `ineligible_reason`), not by rejecting the request — an agent
calling GET /me should see why they have no code, not a 403. RLS scopes
GET / to the caller's own rows regardless (same trust-RLS stance as
api/v1/transactions.py).

GET /admin and POST /{id}/payout (PR 2) are Admin-only oversight + execution
(FR-9.5 — Sub Admin manages bonus RULES only, never referral activity itself,
so there is deliberately no sub_admin branch here, unlike payments.py's
_require_platform_admin). _require_admin checks platform_scope in addition to
role for the same reason api/v1/payments.py's recipient search does: the
referrals_rls admin bypass predicate itself requires
`role='admin' AND platform_scope='true'`, so a role-only check would let a
line-scoped admin through the app layer straight into an always-empty 200.
"""

from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.core.masking import mask_mobile
from app.db.session import get_db
from app.models.payout import PayoutType
from app.models.referral import Referral, ReferralStatus
from app.schemas.referrals import (
    AdminReferralListResponse,
    AdminReferralRead,
    MyReferralResponse,
    ReferralListResponse,
    ReferralPayoutRequest,
    ReferralPayoutResponse,
    ReferralRead,
)
from app.services import payments as payments_service
from app.services import referrals
from app.services.payout_recipients import resolve_identities

router = APIRouter()

logger = logging.getLogger(__name__)

# Same typed-error -> HTTP mapping convention as api/v1/payments.py's
# _ERROR_STATUS, duplicated rather than imported cross-router: the two
# surfaces are independent HTTP boundaries and only share the exception
# TYPES (from services.payments), not a router-to-router dependency.
_ERROR_STATUS = {
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


def _map_payout_error(exc: payments_service.PayoutError) -> HTTPException:
    code = _ERROR_STATUS.get(type(exc), status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=code, detail=str(exc))


def _require_admin(current_user: CurrentUser) -> None:
    if current_user.role != "admin" or current_user.platform_scope != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Referral oversight is restricted to platform admins.",
        )


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


@router.get("/admin", response_model=AdminReferralListResponse)
async def list_referrals_admin(
    status_filter: ReferralStatus | None = None,
    # Never "both" — a referral's business_line is set once at conversion
    # from a concrete loan_application/property_deal line (record_conversion
    # in services/referrals.py), same domain restriction as
    # schemas/payments.py's PayoutCreate.business_line.
    business_line: Literal["loans", "real_estate"] | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> AdminReferralListResponse:
    """No default status filter here (mirrors GET /payouts) — the actionable
    "accrued" default lives in the frontend hook, same split as
    use-admin-payouts.ts's statusFilter default."""
    _require_admin(current_user)
    rows = await referrals.list_for_admin(
        db,
        status_filter=status_filter,
        business_line=business_line,
        limit=limit,
        offset=offset,
    )

    uuids = {r.referrer_auth_user_uuid for r in rows}
    # Group by line the same way api/v1/payments.py::_to_read does, so a
    # dual-line referrer's displayed code matches the referral's own line.
    prefer_line = {r.referrer_auth_user_uuid: r.business_line for r in rows if r.business_line}
    identities = await resolve_identities(db, uuids, prefer_line=prefer_line)

    return AdminReferralListResponse(
        referrals=[
            AdminReferralRead(
                id=r.id,
                referrer_auth_user_uuid=r.referrer_auth_user_uuid,
                referrer_name=(
                    identities[r.referrer_auth_user_uuid].name
                    if r.referrer_auth_user_uuid in identities
                    else None
                ),
                referrer_code=(
                    identities[r.referrer_auth_user_uuid].code
                    if r.referrer_auth_user_uuid in identities
                    else None
                ),
                referred_mobile_masked=mask_mobile(r.referred_mobile),
                business_line=r.business_line,
                conversion_status=r.conversion_status.value,
                accrual_reason=r.accrual_reason,
                bonus_amount_paise=r.bonus_amount_paise,
                reward_payout_uuid=r.reward_payout_uuid,
                reward_txn_uuid=r.reward_txn_uuid,
                converted_at=r.converted_at,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )


@router.post(
    "/{referral_id}/payout",
    response_model=ReferralPayoutResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_referral_payout(
    referral_id: UUID,
    req: ReferralPayoutRequest,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> ReferralPayoutResponse:
    """Turns one accrued referral into a real payout. Amount and recipient
    come from the referral row, never from the request body — only the
    destination the referrer actually receives money at is caller-supplied.
    Approval is a separate step at POST /payouts/{id}/approve: this endpoint
    is the maker, never the checker."""
    _require_admin(current_user)

    referral = await db.get(Referral, referral_id)
    if referral is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral not found.")
    if (
        referral.conversion_status != ReferralStatus.ACCRUED
        or referral.reward_payout_uuid is not None
        or referral.bonus_amount_paise is None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Referral is not awaiting payout.",
        )

    try:
        payout_id = await payments_service.create_payout(
            recipient_user_uuid=referral.referrer_auth_user_uuid,
            payout_type=PayoutType.REFERRAL_BONUS,
            business_line=referral.business_line,
            amount_paise=referral.bonus_amount_paise,
            destination_type=req.destination_type,
            destination=req.destination.model_dump(),
            # Deterministic, not client-supplied (see ReferralPayoutRequest's
            # docstring): two concurrent creates for the SAME referral now
            # carry the SAME natural key, so create_payout's own dedupe guard
            # (or the partial-unique index on a genuine race) rejects the
            # second one before any payout row exists — the orphan this
            # endpoint used to be able to leave behind can no longer form.
            idempotency_key=f"ref-{referral.id.hex}",
            maker_user_uuid=current_user.id,
        )
    except payments_service.PayoutError as exc:
        raise _map_payout_error(exc) from None

    attached = await referrals.attach_payout(referral_id=referral.id, payout_id=payout_id)
    if not attached:
        # Belt-and-suspenders: the deterministic key above should make this
        # branch unreachable for the concurrent-create race it used to guard
        # against, but if the referral stopped being accrued for some other
        # reason between the read above and here, best-effort reject the
        # payout we just created rather than leave a live pending_approval
        # artifact with nothing pointing at it. Reject is not value-moving
        # (services/payments.py::reject_payout), so this is safe even if the
        # payout was somehow already approved by the time we get here — that
        # case raises PayoutStateError, swallowed, and logged for investigation.
        try:
            await payments_service.reject_payout(
                payout_id=payout_id,
                rejector_user_uuid=current_user.id,
                reason="Referral was claimed by another payout concurrently.",
            )
        except payments_service.PayoutError:
            logger.warning(
                "referrals.orphan_payout_reject_failed payout_id=%s referral_id=%s",
                payout_id,
                referral.id,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Referral was claimed by another payout concurrently.",
        )

    return ReferralPayoutResponse(payout_id=payout_id)
