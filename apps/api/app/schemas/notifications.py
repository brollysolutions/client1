"""Notification schemas — client lists own feed, marks read, checks unread count.

There is no create schema: notifications are never created via this router,
only by the internal emit_notification producer (services/notifications.py).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.notification import NotificationType


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
