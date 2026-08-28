"""Anonymous preview and acceptance endpoints for approved-Agent setup links."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.cache.redis_keys import (
    TTL_STAFF_INVITE_RATE,
    RedisCache,
    agent_invite_accept_rate_ip_key,
    agent_invite_preview_rate_ip_key,
)
from app.core.client_ip import get_client_ip
from app.core.config import settings
from app.core.deps import get_cache
from app.schemas.agent_invites import AgentInviteAcceptRequest, AgentInvitePreview
from app.schemas.auth import MessageResponse
from app.services import agent_invites

router = APIRouter()
_INVALID_DETAIL = "This invitation link is no longer valid."


async def _rate_limit(
    request: Request,
    cache: RedisCache,
    *,
    key_for: Callable[[str], str],
    cap: int,
) -> None:
    ip = get_client_ip(request)
    if not ip:
        return
    count = await cache.incr_with_expire(key_for(ip), TTL_STAFF_INVITE_RATE)
    if count > cap:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many requests. Please try again later.",
        )


@router.get("/{token}", response_model=AgentInvitePreview)
async def get_agent_invite(
    token: str,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> AgentInvitePreview:
    await _rate_limit(
        request,
        cache,
        key_for=agent_invite_preview_rate_ip_key,
        cap=settings.STAFF_INVITE_PREVIEW_RATE_LIMIT_PER_IP,
    )
    preview = await agent_invites.describe_invite(token)
    if preview is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _INVALID_DETAIL)
    return AgentInvitePreview(**preview)


@router.post("/{token}/accept", response_model=MessageResponse)
async def accept_agent_invite(
    token: str,
    payload: AgentInviteAcceptRequest,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> MessageResponse:
    await _rate_limit(
        request,
        cache,
        key_for=agent_invite_accept_rate_ip_key,
        cap=settings.STAFF_INVITE_ACCEPT_RATE_LIMIT_PER_IP,
    )
    try:
        accepted = await agent_invites.consume_invite(token, payload.password)
    except agent_invites.AgentInvitePasswordRejected as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    if not accepted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _INVALID_DETAIL)
    return MessageResponse(message="Password set. You can sign in now.")
