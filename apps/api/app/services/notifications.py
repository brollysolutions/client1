"""Notification producer — best-effort emit on a bypass session.

Runs on its OWN session connecting as the 'app' superuser (bypasses RLS),
the same mechanism as services.leads.capture_lead, so a notification write
never depends on the caller's own request transaction. That also means a
future cross-user producer (e.g. staff notifying a client) needs no RLS
change: the superuser session can already insert a row owned by any user.

Best-effort: swallows all errors so a failed notification insert can never
break the business action that triggered it (a booked site visit must
succeed even if the "we got your request" notification fails to write).

After the notification row commits, also fans out a browser push for it
(services.push.send_to_user) on the same bypass session — a no-op in mock
mode (no VAPID keys configured), and itself best-effort within this same
try/except so a push failure is exactly as harmless as a notification-write
failure.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.core.navigation import notification_path_or_none
from app.db.session import AsyncSessionLocal
from app.models.notification import Notification, NotificationType
from app.models.user import User, UserStatus
from app.services import push
from app.services.email import send_notification_email

logger = logging.getLogger(__name__)


async def emit_notification(
    *,
    user_uuid: UUID,
    notification_type: NotificationType,
    title: str,
    body: str,
    href: str | None = None,
) -> None:
    href = notification_path_or_none(href)
    try:
        async with AsyncSessionLocal() as session:
            session.add(
                Notification(
                    user_uuid=user_uuid,
                    type=notification_type,
                    title=title,
                    body=body,
                    href=href,
                )
            )
            await session.commit()
            if push._is_live():
                await push.send_to_user(
                    session, user_uuid=user_uuid, title=title, body=body, href=href
                )
            user = await session.get(User, user_uuid)
            if user and user.status == UserStatus.ACTIVE and user.email and user.email_verified_at:
                await send_notification_email(user.email, title, body, href)
    except Exception:  # emit is best-effort; never break the triggering action
        logger.warning(
            "notification.emit_failed user_uuid=%s type=%s",
            user_uuid,
            notification_type,
            exc_info=True,
        )
