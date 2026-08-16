"""Push subscription schemas — subscribe/unsubscribe this browser, fetch the
public VAPID key needed to call pushManager.subscribe() client-side.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.core.push_endpoints import validate_push_endpoint


class VapidPublicKeyResponse(BaseModel):
    public_key: str


class PushSubscribeRequest(BaseModel):
    endpoint: Annotated[str, Field(min_length=1, max_length=2048)]
    p256dh: Annotated[str, Field(min_length=1, max_length=512)]
    auth: Annotated[str, Field(min_length=1, max_length=512)]

    @field_validator("endpoint")
    @classmethod
    def endpoint_is_approved_push_service(cls, value: str) -> str:
        return validate_push_endpoint(value)


class PushUnsubscribeRequest(BaseModel):
    # Keep unsubscribe usable for a legacy endpoint that no longer passes the
    # stricter subscription validator.
    endpoint: Annotated[str, Field(min_length=1, max_length=2048)]
