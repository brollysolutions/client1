"""OTP delivery dispatcher — Voice (2Factor.in) primary, Email (SMTP) fallback.

SMS is intentionally not a channel: India DLT registration is out of scope and
operators block non-DLT A2P SMS. The OTP itself is still generated/hashed/stored
in Redis by services.otp; this module only transports the plaintext code.

Channel selection:
  - register / forgot: voice first; on hard failure (API error or disabled), the
    SAME code is emailed as a fallback.
  - resend recovery: via_email=True forces email ("didn't get the call? email it").

Returns the channel that actually accepted the message:
  "voice" | "email" | "none"  ("none" = all channels mocked/failed — dev only;
  the caller then exposes otp_hint in non-production).
"""

from __future__ import annotations

import logging
from typing import Literal

import httpx

from app.core.config import settings
from app.core.masking import mask_mobile
from app.services.email import send_email

logger = logging.getLogger(__name__)

# 2Factor.in Voice OTP: an automated call reads out the code. No DLT required.
# NOTE: confirm the exact path/response against 2Factor live docs before go-live.
_VOICE_URL = "https://2factor.in/API/V1/{api_key}/VOICE/{mobile}/{otp}"

DeliveryChannel = Literal["voice", "email", "none"]

_OTP_EMAIL_SUBJECT = "Your verification code"


def _otp_email_body(otp: str) -> str:
    return (
        f"Your verification code is {otp}.\n\n"
        "It expires in 5 minutes. If you did not request this, ignore this email."
    )


def _to_2factor_mobile(e164: str) -> str:
    """Strip country code for 2Factor.in — it expects a bare 10-digit Indian mobile.

    Input is always E.164 (+91XXXXXXXXXX). The API returns 400 when the leading
    '+' or country code is present in the URL path.
    """
    digits = e164.lstrip("+")
    # Drop leading 91 (India country code) if present and the remainder is 10 digits.
    if digits.startswith("91") and len(digits) == 12:
        return digits[2:]
    return digits


async def _send_via_voice(mobile: str, otp: str) -> bool:
    """Place a 2Factor voice OTP call. Returns True on success, False otherwise.

    Mock mode: active when VOICE_OTP_ENABLED is False or TWOFACTOR_API_KEY is empty
    — logs the OTP at WARNING (dev only) and returns False so email fallback runs.
    """
    if not settings.VOICE_OTP_ENABLED or not settings.TWOFACTOR_API_KEY:
        # Do NOT log the OTP: if voice is misconfigured-off in prod this would leak
        # live codes. Dev still gets the code via the API response's otp_hint.
        logger.warning("VOICE_MOCK mobile=%s (voice disabled)", mask_mobile(mobile))
        return False

    url = _VOICE_URL.format(
        api_key=settings.TWOFACTOR_API_KEY,
        mobile=_to_2factor_mobile(mobile),
        otp=otp,
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
        resp.raise_for_status()
        # 2Factor signals real success in the body, not just HTTP 200.
        try:
            body_status = resp.json().get("Status")
        except ValueError:
            body_status = None
        if body_status == "Success":
            logger.info("voice.sent provider=2factor mobile=%s", mask_mobile(mobile))
            return True
        # Whitelisted fields only, never raw body: provider error bodies can
        # echo the request URL, which carries the API key and OTP in its path.
        logger.warning(
            "voice.2factor_rejected mobile=%s http=%s status=%s",
            mask_mobile(mobile),
            resp.status_code,
            body_status,
        )
        return False
    except httpx.HTTPStatusError as exc:
        # NEVER stringify httpx errors here: their message embeds the full
        # request URL, i.e. the live API key and the plaintext OTP.
        logger.warning(
            "voice.2factor_failed mobile=%s http=%s",
            mask_mobile(mobile),
            exc.response.status_code,
        )
        return False
    except Exception as exc:
        logger.warning(
            "voice.2factor_failed mobile=%s error=%s",
            mask_mobile(mobile),
            type(exc).__name__,
        )
        return False


async def deliver_otp(
    mobile: str,
    email: str,
    otp: str,
    *,
    via_email: bool = False,
    allow_email_fallback: bool = True,
) -> DeliveryChannel:
    """Deliver the OTP. Voice first, email fallback; via_email forces email only.

    allow_email_fallback=False (public agent-application intake only): the
    applicant's email is self-asserted, unverified input. If voice fails or is
    disabled, falling back to that email would let anyone who knows a victim's
    mobile number — but cannot answer it — still receive the code by typing
    their own email address, defeating the entire point of proving control of
    the mobile. Every other caller (register/forgot, both authenticated-adjacent
    flows collecting the user's own verified-later email) keeps the default.
    """
    if via_email:
        if await send_email(email, _OTP_EMAIL_SUBJECT, _otp_email_body(otp)):
            return "email"
        return "none"

    if await _send_via_voice(mobile, otp):
        return "voice"

    if not allow_email_fallback:
        return "none"

    # Voice failed/disabled — fall back to the same code over email.
    if await send_email(email, _OTP_EMAIL_SUBJECT, _otp_email_body(otp)):
        return "email"

    return "none"
