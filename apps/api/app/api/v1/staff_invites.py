"""Anonymous endpoints for a staff first-login invite link.

Deliberately its own router rather than more surface on `api/v1/auth.py`: these
two routes are the only anonymous path that can set a password without an OTP,
and keeping them together makes that boundary easy to audit.

Both are IP rate-limited on the same pattern as `api/v1/leads.py`'s contact
invitation, but against **separate** counters — opening the page must never
consume the budget for actually setting a password, or a handful of page loads
would lock a legitimate invitee out of their own invitation.

Both return the same shape for an unknown, expired, used, or revoked token, so a
caller cannot use the response to tell a wrong guess from a right-but-spent one.
"""

from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.cache.redis_keys import (
    TTL_STAFF_INVITE_RATE,
    RedisCache,
    staff_invite_accept_rate_ip_key,
    staff_invite_preview_rate_ip_key,
)
from app.core.client_ip import get_client_ip
from app.core.config import settings
from app.core.deps import get_cache
from app.schemas.auth import MessageResponse
from app.schemas.staff_invites import StaffInviteAcceptRequest, StaffInvitePreview
from app.services import staff_invites

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


@router.get("/{token}", response_model=StaffInvitePreview)
async def get_staff_invite(
    token: str,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> StaffInvitePreview:
    await _rate_limit(
        request,
        cache,
        key_for=staff_invite_preview_rate_ip_key,
        cap=settings.STAFF_INVITE_PREVIEW_RATE_LIMIT_PER_IP,
    )
    preview = await staff_invites.describe_invite(token)
    if preview is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _INVALID_DETAIL)
    return StaffInvitePreview(first_name=preview["first_name"], role=preview["role"])


@router.post("/{token}/accept", response_model=MessageResponse)
async def accept_staff_invite(
    token: str,
    payload: StaffInviteAcceptRequest,
    request: Request,
    cache: RedisCache = Depends(get_cache),
) -> MessageResponse:
    """Set the invitee's own password and burn the link.

    The cap is the tighter of the two: this is the write, and no legitimate
    invitee needs more than a handful of tries to satisfy the password policy.
    """
    await _rate_limit(
        request,
        cache,
        key_for=staff_invite_accept_rate_ip_key,
        cap=settings.STAFF_INVITE_ACCEPT_RATE_LIMIT_PER_IP,
    )
    try:
        accepted = await staff_invites.consume_invite(token, payload.password)
    except staff_invites.StaffInvitePasswordRejected as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    if not accepted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _INVALID_DETAIL)
    return MessageResponse(message="Password set. You can sign in now.")
