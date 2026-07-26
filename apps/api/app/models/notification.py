"""Notifications — per-recipient feed of account-level events.

Identity-level, like support_tickets: no business_line column (an account
gets notified regardless of which line the triggering event belongs to), RLS
keys on app.auth_user_uuid. Every row today is a self-notification (the
recipient is the client whose own site-visit/support-ticket action produced
it), written by the bypass-session emit_notification helper
(services/notifications.py); that helper's use of a superuser session (not
the client's own RLS-scoped one) is what will let a future cross-user
producer (e.g. staff notifying a client) work with no RLS change.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NotificationType(enum.StrEnum):
    SITE_VISIT_REQUESTED = "site_visit_requested"
    SITE_VISIT_CANCELLED = "site_visit_cancelled"
    SUPPORT_TICKET_RECEIVED = "support_ticket_received"
    LEAD_ASSIGNED = "lead_assigned"
    LEAD_RELEASED = "lead_released"
    TASK_ASSIGNED = "task_assigned"
    LOAN_STATUS_UPDATED = "loan_status_updated"
    PROPERTY_DEAL_STATUS_UPDATED = "property_deal_status_updated"


_ev = lambda x: [e.value for e in x]  # noqa: E731
notification_type_enum = ENUM(
    NotificationType, name="notification_type", create_type=False, values_callable=_ev
)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    type: Mapped[NotificationType] = mapped_column(notification_type_enum, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    href: Mapped[str | None] = mapped_column(String(300), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
