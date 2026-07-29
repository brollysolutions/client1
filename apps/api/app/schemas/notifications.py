"""Notification schemas — client lists own feed, marks read, checks unread count.

Notifications are never created directly via this router for the own-feed
surface — only by the internal emit_notification producer
(services/notifications.py). The admin broadcast schemas below are the one
exception: services/admin_notify.py::broadcast is the writer they front.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.notification import NotificationType
from app.services.admin_notify import BroadcastAudience


class NotificationRead(BaseModel):
    id: UUID
    type: NotificationType
    title: str
    body: str
    href: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    notifications: list[NotificationRead]


class UnreadCountResponse(BaseModel):
    count: int


class BroadcastRequest(BaseModel):
    audience: BroadcastAudience
    business_line: Literal["loans", "real_estate"] | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=2000)
    href: str | None = Field(default=None, max_length=300)


class BroadcastResponse(BaseModel):
    recipients: int


class BroadcastPreviewResponse(BaseModel):
    recipients: int
