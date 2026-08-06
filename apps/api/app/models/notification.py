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
    AGENT_LEAD_EXPIRED = "agent_lead_expired"
    TASK_ASSIGNED = "task_assigned"
    LOAN_STATUS_UPDATED = "loan_status_updated"
    PROPERTY_DEAL_STATUS_UPDATED = "property_deal_status_updated"
    REFERRAL_CONVERTED = "referral_converted"
    SUPPORT_TICKET_RESOLVED = "support_ticket_resolved"
    DOCUMENT_REVIEW_UPDATED = "document_review_updated"
    # FR-11.3 — a non-acting admin hears about a major action. One value per
    # *class* an admin reads, not per audit action (see services/admin_notify.py):
    # ADMIN_PAYOUT_REVIEWED covers both PAYOUT_APPROVED and PAYOUT_REJECTED (the
    # title differentiates), same shape as DOCUMENT_REVIEW_UPDATED above already
    # covering verified/unverified in one value.
    ADMIN_PAYOUT_REVIEWED = "admin_payout_reviewed"
    ADMIN_ACCOUNT_ACTION = "admin_account_action"
    ADMIN_RETENTION_PURGED = "admin_retention_purged"
    ADMIN_BROADCAST = "admin_broadcast"


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
