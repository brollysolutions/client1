"""SMS dispatch — 2Factor.in primary, Fast2SMS failover, mock when no keys."""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_TWOFACTOR_URL = "https://2factor.in/API/V1/{api_key}/SMS/{mobile}/{otp}"
_FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"


class SMSDeliveryError(Exception):
    pass


async def send_otp_sms(mobile: str, otp: str) -> bool:
    """
    Dispatch OTP via SMS. Returns True if sent, False if mocked.

    Mock mode: active when both TWOFACTOR_API_KEY and FAST2SMS_API_KEY are empty.
    Logs OTP at WARNING level in mock mode (dev/staging only).
    Raises SMSDeliveryError only when keys are present but both providers fail.
    """
    if not settings.TWOFACTOR_API_KEY and not settings.FAST2SMS_API_KEY:
        logger.warning("SMS_MOCK mobile=%s otp=%s", mobile, otp)
        return False

    async with httpx.AsyncClient(timeout=10.0) as client:
        if settings.TWOFACTOR_API_KEY:
            try:
                url = _TWOFACTOR_URL.format(
                    api_key=settings.TWOFACTOR_API_KEY,
                    mobile=mobile,
                    otp=otp,
                )
                resp = await client.get(url)
                resp.raise_for_status()
                logger.info("sms.sent provider=2factor mobile=%s", mobile)
                return True
            except Exception as exc:
                logger.warning("sms.2factor_failed mobile=%s error=%s", mobile, exc)

        if settings.FAST2SMS_API_KEY:
            try:
                resp = await client.post(
                    _FAST2SMS_URL,
                    headers={"authorization": settings.FAST2SMS_API_KEY},
                    json={
                        "route": "otp",
                        "variables_values": otp,
                        "numbers": mobile.lstrip("+"),
                    },
                )
                resp.raise_for_status()
                logger.info("sms.sent provider=fast2sms mobile=%s", mobile)
                return True
            except Exception as exc:
                logger.warning("sms.fast2sms_failed mobile=%s error=%s", mobile, exc)

    raise SMSDeliveryError(f"All SMS providers failed for {mobile}")
