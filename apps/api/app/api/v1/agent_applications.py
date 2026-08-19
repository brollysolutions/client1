"""Public agent-application intake router (docs/specs/agent-application-intake.md).

Unauthenticated write, mirroring api/v1/leads.py's shape: no `get_db`
dependency at all, so the request never enters `get_current_user` and never
sets an RLS session context — the write happens on services.agent_applications'
own bypass session, exactly like services.leads.capture_lead.

Route order per request: OTP initiate/resend/verify -> ticket -> upload
presign (ticket-gated) -> submit (ticket-gated, single-use).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.cache.redis_keys import RedisCache
from app.core.client_ip import get_client_ip
from app.core.deps import get_cache
from app.schemas.agent_applications import (
    AgentApplicationSubmitRequest,
    AgentApplicationSubmitResponse,
    AgentApplyOtpInitiateRequest,
    AgentApplyOtpInitiateResponse,
    AgentApplyOtpResendRequest,
    AgentApplyOtpVerifyRequest,
    AgentApplyTicketResponse,
    AgentApplyUploadPresignRequest,
    AgentApplyUploadPresignResponse,
)
from app.services import agent_applications as service

logger = logging.getLogger(__name__)

router = APIRouter()

_TOO_MANY_REQUESTS = "Too many requests. Please try again later."


@router.post(
    "/otp/initiate",
    response_model=AgentApplyOtpInitiateResponse,
    status_code=status.HTTP_200_OK,
)
async def initiate_otp(
    req: AgentApplyOtpInitiateRequest,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> AgentApplyOtpInitiateResponse:
    if req.company:
        logger.info("agent_application.honeypot step=initiate")
        return AgentApplyOtpInitiateResponse(
            message="Verification code sent. You will receive a call shortly.",
            delivery_channel="none",
        )
    try:
        return await service.initiate_otp(cache, req.mobile, ip=get_client_ip(request))
    except service.OtpDailyLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily verification limit reached for this number. Try again tomorrow.",
        ) from exc


@router.post(
    "/otp/resend",
    response_model=AgentApplyOtpInitiateResponse,
    status_code=status.HTTP_200_OK,
)
async def resend_otp(
    req: AgentApplyOtpResendRequest,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> AgentApplyOtpInitiateResponse:
    return await service.resend(cache, req.mobile, ip=get_client_ip(request))


@router.post(
    "/otp/verify",
    response_model=AgentApplyTicketResponse,
    status_code=status.HTTP_200_OK,
)
async def verify_otp(
    req: AgentApplyOtpVerifyRequest,
    cache: RedisCache = Depends(get_cache),
) -> AgentApplyTicketResponse:
    return await service.verify_otp_issue_ticket(cache, req.mobile, req.otp)


@router.post(
    "/uploads/presign",
    response_model=AgentApplyUploadPresignResponse,
    status_code=status.HTTP_200_OK,
)
async def presign_upload(
    req: AgentApplyUploadPresignRequest,
    cache: RedisCache = Depends(get_cache),
) -> AgentApplyUploadPresignResponse:
    try:
        return await service.presign_document(
            cache, req.application_ticket, req.doc_type, req.content_type
        )
    except service.InvalidApplicationTicket as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your verification expired. Please verify your number again.",
        ) from exc
    except service.ApplicationTicketAlreadyUsed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This application was already submitted.",
        ) from exc
    except service.PresignQuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY_REQUESTS,
        ) from exc


@router.post(
    "",
    response_model=AgentApplicationSubmitResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_application(
    req: AgentApplicationSubmitRequest,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> AgentApplicationSubmitResponse:
    if req.company:
        logger.info("agent_application.honeypot step=submit")
        return AgentApplicationSubmitResponse()
    try:
        await service.submit(cache, req, ip=get_client_ip(request))
    except service.SubmitRateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY_REQUESTS,
        ) from exc
    except service.InvalidApplicationTicket as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your verification expired. Please verify your number again.",
        ) from exc
    except service.ApplicationTicketAlreadyUsed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This application was already submitted.",
        ) from exc
    except service.ObjectKeyMismatch as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="These uploads weren't issued for this application.",
        ) from exc
    except service.UploadMissing as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One of your documents didn't finish uploading. Please try again.",
        ) from exc
    except service.ContentTypeUnrecognized as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="One of your documents isn't a supported file type. Please try again.",
        ) from exc
    except service.StorageUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="We couldn't verify your uploads. Please try again in a moment.",
        ) from exc
    return AgentApplicationSubmitResponse()
