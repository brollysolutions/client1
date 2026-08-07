"""Email dispatch — SMTP transport (AWS SES or any SMTP host), mock when disabled.

Vendor-neutral: AWS SES is just SMTP credentials (SES Console → SMTP settings).
Point SMTP_HOST at email-smtp.<region>.amazonaws.com:587 with the generated
SMTP_USERNAME/SMTP_PASSWORD. Mirrors the boolean-return contract of otp_delivery:
True if handed to the SMTP server, False if mocked/failed (never raises into auth).
"""

from __future__ import annotations

import logging
from email.message import EmailMessage
from urllib.parse import urljoin

import aiosmtplib

from app.core.config import settings
from app.core.masking import mask_email
from app.core.navigation import notification_path_or_none

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plaintext email. Returns True if delivered to SMTP, False if mocked/failed.

    Mock mode: active when EMAIL_ENABLED is False or SMTP_HOST is empty — logs at
    WARNING (dev/staging only) and returns False. Any SMTP error is swallowed and
    returns False so the auth flow is never broken by an email failure.
    """
    if not settings.EMAIL_ENABLED or not settings.SMTP_HOST:
        logger.warning("EMAIL_MOCK to=%s subject=%s", mask_email(to), subject)
        return False

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM or settings.SMTP_USERNAME
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=settings.SMTP_USE_TLS,
            timeout=10.0,
        )
        logger.info("email.sent to=%s subject=%s", mask_email(to), subject)
        return True
    except Exception as exc:  # delivery failure must not break the auth flow
        logger.warning("email.failed to=%s error=%s", mask_email(to), exc)
        return False


def notification_email_body(body: str, href: str | None) -> str:
    """Render a plaintext transactional notification with a safe action URL."""
    destination = notification_path_or_none(href) or "/dashboard/notifications"
    action_url = urljoin(f"{settings.PUBLIC_WEB_ORIGIN.rstrip('/')}/", destination.lstrip("/"))
    return f"{body}\n\nOpen Dhanadhara: {action_url}"


async def send_notification_email(to: str, subject: str, body: str, href: str | None) -> bool:
    """Best-effort transactional copy of an in-app notification."""
    if not settings.NOTIFICATION_EMAIL_ENABLED:
        return False
    return await send_email(to, subject, notification_email_body(body, href))
