"""Public/authenticated intake and Admin maker/checker routes."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.cache.redis_keys import RedisCache
from app.core.client_ip import get_client_ip
from app.core.deps import CurrentUser, get_active_user, get_cache, require_platform_admin
from app.models.mobile_change import MobileChangeSource
from app.schemas.auth import MessageResponse
from app.schemas.mobile_change import (
    MobileChangeAdminCompleteRequest,
    MobileChangeAdminListResponse,
    MobileChangeAdminRejectRequest,
    MobileChangeAdminVerifyRequest,
    MobileChangeAuthenticatedInitiateRequest,
    MobileChangeChallengeResponse,
    MobileChangePublicInitiateRequest,
    MobileChangeResendRequest,
    MobileChangeVerifyOtpRequest,
)
from app.services import mobile_change as service

logger = logging.getLogger(__name__)

router = APIRouter()
admin_router = APIRouter()

_GENERIC_SUBMITTED = (
    "If the account is eligible, your request has been sent to support for identity review."
)


def _rate_limited() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests. Please try again later.",
    )


@router.post("/initiate", response_model=MobileChangeChallengeResponse)
async def initiate_public(
    payload: MobileChangePublicInitiateRequest,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> MobileChangeChallengeResponse:
    if payload.company:
        logger.info("mobile_change.honeypot")
        return MobileChangeChallengeResponse(
            message="Verification code sent to the replacement number.",
            challenge_token="discarded",
            delivery_channel="none",
        )
    try:
        return await service.initiate(
            cache,
            current_mobile=payload.current_mobile,
            requested_mobile=payload.requested_mobile,
            source=MobileChangeSource.PUBLIC,
            target_uuid=None,
            ip=get_client_ip(request),
        )
    except service.MobileChangeRateLimited as exc:
        raise _rate_limited() from exc


@router.post("/authenticated/initiate", response_model=MobileChangeChallengeResponse)
async def initiate_authenticated(
    payload: MobileChangeAuthenticatedInitiateRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_active_user),
    cache: RedisCache = Depends(get_cache),
) -> MobileChangeChallengeResponse:
    if payload.requested_mobile == current_user.mobile:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The replacement number must be different.",
        )
    try:
        return await service.initiate_authenticated(
            cache,
            target_uuid=current_user.id,
            requested_mobile=payload.requested_mobile,
            current_password=payload.current_password,
            ip=get_client_ip(request),
        )
    except service.AdminReauthenticationFailed as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect.",
        ) from exc
    except service.IdentityConflict as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is not eligible for this recovery flow.",
        ) from exc
    except service.MobileChangeRateLimited as exc:
        raise _rate_limited() from exc


@router.post("/resend", response_model=MobileChangeChallengeResponse)
async def resend(
    payload: MobileChangeResendRequest,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> MobileChangeChallengeResponse:
    try:
        return await service.resend_challenge(
            cache,
            challenge_token=payload.challenge_token,
            ip=get_client_ip(request),
        )
    except service.InvalidChallenge as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification session expired. Start again.",
        ) from exc
    except service.MobileChangeRateLimited as exc:
        raise _rate_limited() from exc


@router.post("/verify", response_model=MessageResponse)
async def verify(
    payload: MobileChangeVerifyOtpRequest,
    cache: RedisCache = Depends(get_cache),
) -> MessageResponse:
    try:
        await service.verify_challenge(
            cache,
            challenge_token=payload.challenge_token,
            otp=payload.otp,
        )
    except service.InvalidChallenge as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification session expired. Start again.",
        ) from exc
    # Enumeration-safe for unknown numbers, Admin targets, already-active
    # requests, and successfully-created requests alike.
    return MessageResponse(message=_GENERIC_SUBMITTED)


@admin_router.get("", response_model=MobileChangeAdminListResponse)
async def list_requests(
    current_user: CurrentUser = Depends(require_platform_admin),
) -> MobileChangeAdminListResponse:
    try:
        requests = await service.list_for_admin(actor_uuid=current_user.id)
    except service.AdminReauthenticationFailed as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an active platform Admin may access this queue.",
        ) from exc
    return MobileChangeAdminListResponse(requests=requests)


def _admin_error(exc: Exception) -> HTTPException:
    if isinstance(exc, service.RequestNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Mobile-change request not found.")
    if isinstance(exc, service.AdminReauthenticationFailed):
        return HTTPException(status.HTTP_403_FORBIDDEN, "Current password is incorrect.")
    if isinstance(exc, service.IdentityConflict):
        return HTTPException(
            status.HTTP_409_CONFLICT,
            "Resolve the identity conflicts shown on this request before continuing.",
        )
    if isinstance(exc, service.MakerCheckerViolation):
        return HTTPException(
            status.HTTP_409_CONFLICT,
            "The requester, identity verifier, and final approver must be different users.",
        )
    return HTTPException(
        status.HTTP_409_CONFLICT,
        "This request is no longer at the required workflow step.",
    )


@admin_router.post("/{request_id}/verify", response_model=MessageResponse)
async def verify_identity(
    request_id: UUID,
    payload: MobileChangeAdminVerifyRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
) -> MessageResponse:
    try:
        await service.verify_identity(
            request_id,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
            proof_method=payload.proof_method,
            proof_attestation=payload.proof_attestation,
            current_password=payload.current_password,
        )
    except (
        service.RequestNotFound,
        service.RequestStateConflict,
        service.IdentityConflict,
        service.MakerCheckerViolation,
        service.AdminReauthenticationFailed,
    ) as exc:
        raise _admin_error(exc) from exc
    return MessageResponse(message="Identity evidence recorded. A different Admin must approve.")


@admin_router.post("/{request_id}/complete", response_model=MessageResponse)
async def complete(
    request_id: UUID,
    payload: MobileChangeAdminCompleteRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    cache: RedisCache = Depends(get_cache),
) -> MessageResponse:
    try:
        await service.complete(
            request_id,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
            current_password=payload.current_password,
            cache=cache,
        )
    except (
        service.RequestNotFound,
        service.RequestStateConflict,
        service.IdentityConflict,
        service.MakerCheckerViolation,
        service.AdminReauthenticationFailed,
    ) as exc:
        raise _admin_error(exc) from exc
    return MessageResponse(message="Mobile number changed and all prior sessions revoked.")


@admin_router.post("/{request_id}/reject", response_model=MessageResponse)
async def reject(
    request_id: UUID,
    payload: MobileChangeAdminRejectRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
) -> MessageResponse:
    try:
        await service.reject(
            request_id,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
            reason=payload.reason,
            current_password=payload.current_password,
        )
    except (
        service.RequestNotFound,
        service.RequestStateConflict,
        service.MakerCheckerViolation,
        service.AdminReauthenticationFailed,
    ) as exc:
        raise _admin_error(exc) from exc
    return MessageResponse(message="Mobile-number change request rejected.")
