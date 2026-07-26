"""Push subscription schemas — subscribe/unsubscribe this browser, fetch the
public VAPID key needed to call pushManager.subscribe() client-side.
"""

from __future__ import annotations

from pydantic import BaseModel


class VapidPublicKeyResponse(BaseModel):
    public_key: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushUnsubscribeRequest(BaseModel):
    endpoint: str
