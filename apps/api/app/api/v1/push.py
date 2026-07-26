"""Push subscription management — user-facing self-service, unlike
notifications (which has no create endpoint at all).

subscribe/unsubscribe write on the bypass session (see
services/push.py::upsert_subscription docstring for why: a shared/reused
browser can hand the same push endpoint to a different account, and RLS's
owner-only policy would block that account's own session from ever seeing
the row to reassign it). The route itself is still the authorization
boundary — every call is scoped to `current_user.id` from the verified JWT,
never a client-supplied user id.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, get_active_user
from app.schemas.push import (
    PushSubscribeRequest,
    PushUnsubscribeRequest,
    VapidPublicKeyResponse,
)
from app.services import push

router = APIRouter()


@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
async def get_vapid_public_key() -> VapidPublicKeyResponse:
    return VapidPublicKeyResponse(public_key=await push.get_vapid_public_key())


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: CurrentUser = Depends(get_active_user),
) -> None:
    await push.upsert_subscription(
        user_uuid=current_user.id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushUnsubscribeRequest,
    current_user: CurrentUser = Depends(get_active_user),
) -> None:
    # Idempotent, no existence leak (matches notifications.mark_read's
    # stance): a stale/already-removed endpoint is still a 204.
    await push.delete_subscription(user_uuid=current_user.id, endpoint=body.endpoint)
