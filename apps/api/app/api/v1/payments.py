"""Payout administration — maker-checker disbursement + RazorpayX webhook.

Admin surface (create / approve / reject / list) is platform-admin only, enforced
in the app layer AND by the payouts RLS policy (platform_scope). The webhook
receiver is UNAUTHENTICATED but signature-gated (HMAC-SHA256, fail-closed) — it
carries no JWT/RLS context because settle writes run on the bypass session.

Every write goes through services.payments on the app-superuser bypass session;
this router authenticates, validates the actor, and shapes the (masked) response.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from collections.abc import Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.payout import Payout, PayoutStatus
from app.schemas.payments import (
    PayoutCreate,
    PayoutListResponse,
    PayoutRead,
    PayoutRecipientListResponse,
    PayoutRecipientRead,
    PayoutReject,
    WebhookAck,
)
from app.services import payments as payments_service
from app.services.payout_recipients import resolve_identities, search_recipients

logger = logging.getLogger(__name__)

router = APIRouter()

# Typed domain error → HTTP status.
_ERROR_STATUS = {
    payments_service.RecipientNotFound: status.HTTP_404_NOT_FOUND,
    payments_service.PayoutNotFound: status.HTTP_404_NOT_FOUND,
    payments_service.RecipientInactive: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.PayoutAmountExceeded: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.PayoutDailyCapExceeded: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.PayoutCapNotConfigured: status.HTTP_422_UNPROCESSABLE_ENTITY,
    payments_service.DuplicatePayout: status.HTTP_409_CONFLICT,
    payments_service.PayoutStateError: status.HTTP_409_CONFLICT,
    payments_service.MakerCheckerViolation: status.HTTP_403_FORBIDDEN,
    payments_service.SelfPayoutForbidden: status.HTTP_403_FORBIDDEN,
    payments_service.GatewayError: status.HTTP_502_BAD_GATEWAY,
}


def _map_error(exc: payments_service.PayoutError) -> HTTPException:
    code = _ERROR_STATUS.get(type(exc), status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=code, detail=str(exc))


def _require_platform_admin(current_user: CurrentUser) -> None:
    """Only platform Admin / Sub Admin may manage payouts."""
    if current_user.role not in ("admin", "sub_admin") or current_user.platform_scope != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Payout administration is restricted to platform admins.",
        )


def _require_admin(current_user: CurrentUser, action: str = "Approving a payout") -> None:
    """Full-Admin-only actions (checker approve, recipient lookup)."""
    if current_user.role != "admin" or current_user.platform_scope != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{action} is restricted to platform admins.",
        )


async def _get_payout_or_404(db: AsyncSession, payout_id: UUID) -> Payout:
    payout = await db.scalar(select(Payout).where(Payout.id == payout_id))
    if payout is None:
        # RLS already scopes to platform admins; a miss reads as "not found".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payout not found.")
    return payout


async def _to_read(db: AsyncSession, payouts: Sequence[Payout]) -> list[PayoutRead]:
    """Enrich payout rows with display identity in one batch (never per-row)."""
    uuids: set[UUID] = set()
    prefer_line: dict[UUID, str | None] = {}
    for p in payouts:
        row_uuids = (
            p.recipient_user_uuid,
            p.maker_user_uuid,
            p.checker_user_uuid,
            p.rejected_by_user_uuid,
        )
        for uid in row_uuids:
            if uid is not None:
                uuids.add(uid)
        prefer_line[p.recipient_user_uuid] = p.business_line

    identities = await resolve_identities(db, uuids, prefer_line=prefer_line)

    reads: list[PayoutRead] = []
    for p in payouts:
        recipient = identities.get(p.recipient_user_uuid)
        maker = identities.get(p.maker_user_uuid)
        checker = identities.get(p.checker_user_uuid) if p.checker_user_uuid else None
        rejected_by = identities.get(p.rejected_by_user_uuid) if p.rejected_by_user_uuid else None
        read = PayoutRead.model_validate(p, from_attributes=True)
        read.recipient_name = recipient.name if recipient else None
        read.recipient_code = recipient.code if recipient else None
        read.maker_name = maker.name if maker else None
        read.checker_name = checker.name if checker else None
        read.rejected_by_name = rejected_by.name if rejected_by else None
        reads.append(read)
    return reads


@router.post("", response_model=PayoutRead, status_code=status.HTTP_201_CREATED)
async def create_payout(
    req: PayoutCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutRead:
    _require_platform_admin(current_user)
    try:
        payout_id = await payments_service.create_payout(
            recipient_user_uuid=req.recipient_user_uuid,
            payout_type=req.type,
            business_line=req.business_line,
            amount_paise=req.amount_paise,
            destination_type=req.destination_type,
            destination=req.destination.model_dump(),
            idempotency_key=req.idempotency_key,
            maker_user_uuid=current_user.id,
        )
    except payments_service.PayoutError as exc:
        raise _map_error(exc) from None

    payout = await _get_payout_or_404(db, payout_id)
    return (await _to_read(db, [payout]))[0]


@router.post("/{payout_id}/approve", response_model=PayoutRead)
async def approve_payout(
    payout_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutRead:
    _require_admin(current_user)
    try:
        await payments_service.approve_payout(
            payout_id=payout_id, checker_user_uuid=current_user.id
        )
    except payments_service.PayoutError as exc:
        raise _map_error(exc) from None

    payout = await _get_payout_or_404(db, payout_id)
    return (await _to_read(db, [payout]))[0]


@router.post("/{payout_id}/reject", response_model=PayoutRead)
async def reject_payout(
    payout_id: UUID,
    req: PayoutReject,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutRead:
    _require_platform_admin(current_user)
    try:
        await payments_service.reject_payout(
            payout_id=payout_id,
            rejector_user_uuid=current_user.id,
            reason=req.reason,
        )
    except payments_service.PayoutError as exc:
        raise _map_error(exc) from None

    payout = await _get_payout_or_404(db, payout_id)
    return (await _to_read(db, [payout]))[0]


@router.get("/recipients", response_model=PayoutRecipientListResponse)
async def list_payout_recipients(
    q: str = Query(min_length=2, max_length=64),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutRecipientListResponse:
    """Recipient picker search for the payout create form.

    Admin-only (not _require_platform_admin): a Sub Admin passing the looser
    guard would hit auth_users_rls and get an always-empty 200, the worst
    possible failure mode for a search box. An honest 403 says what is true.
    """
    _require_admin(current_user, action="Recipient lookup")
    hits = await search_recipients(db, q=q, limit=limit, exclude_user_uuid=current_user.id)
    return PayoutRecipientListResponse(
        recipients=[
            PayoutRecipientRead(
                auth_user_uuid=h.auth_user_uuid,
                name=h.name,
                codes=h.codes,
                kind=h.kind,
                mobile_last4=h.mobile_last4,
            )
            for h in hits
        ]
    )


@router.get("", response_model=PayoutListResponse)
async def list_payouts(
    status_filter: PayoutStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutListResponse:
    _require_platform_admin(current_user)
    stmt = select(Payout).order_by(Payout.created_at.desc()).limit(limit).offset(offset)
    if status_filter is not None:
        stmt = stmt.where(Payout.status == status_filter)
    result = await db.execute(stmt)
    payouts = result.scalars().all()
    return PayoutListResponse(payouts=await _to_read(db, payouts))


@router.post("/webhook/razorpay", response_model=WebhookAck)
async def razorpay_webhook(request: Request) -> WebhookAck:
    """RazorpayX payout webhook — fail-closed HMAC-SHA256 verification.

    No auth dependency: authenticity comes from the signature, not a JWT. A
    missing secret or a bad signature is rejected with 400 and NO state change.
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = settings.RAZORPAY_WEBHOOK_SECRET

    # Fail closed: without a configured secret we cannot trust any payload.
    if not secret or not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unverified webhook.")

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad signature.")

    try:
        payload = json.loads(raw_body)
        event = payload["event"]
        entity = payload["payload"]["payout"]["entity"]
        gateway_payout_id = entity["id"]
    except (ValueError, KeyError, TypeError):
        # Signature was valid but the shape is unexpected — ack so RazorpayX stops
        # retrying, but change nothing.
        logger.warning("payout.webhook_malformed")
        return WebhookAck()

    await payments_service.settle_from_webhook(event=event, gateway_payout_id=gateway_payout_id)
    return WebhookAck()
