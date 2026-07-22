"""Notification producer — best-effort emit on a bypass session.

Runs on its OWN session connecting as the 'app' superuser (bypasses RLS),
the same mechanism as services.leads.capture_lead, so a notification write
never depends on the caller's own request transaction. That also means a
future cross-user producer (e.g. staff notifying a client) needs no RLS
change: the superuser session can already insert a row owned by any user.

Best-effort: swallows all errors so a failed notification insert can never
break the business action that triggered it (a booked site visit must
succeed even if the "we got your request" notification fails to write).
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.db.session import AsyncSessionLocal
from app.models.notification import Notification, NotificationType

logger = logging.getLogger(__name__)


async def emit_notification(
    *,
    user_uuid: UUID,
    notification_type: NotificationType,
    title: str,
    body: str,
    href: str | None = None,
) -> None:
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
    except Exception:  # emit is best-effort; never break the triggering action
        logger.warning(
            "notification.emit_failed user_uuid=%s type=%s",
            user_uuid,
            notification_type,
            exc_info=True,
        )
