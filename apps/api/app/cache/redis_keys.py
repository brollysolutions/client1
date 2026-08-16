"""Redis key namespace constants and typed helpers (Auth Design §8)."""

from __future__ import annotations

import hashlib
from typing import Any

import redis.asyncio as aioredis

# ---------------------------------------------------------------------------
# Key templates  (Auth Design §8 — exact names, locked scope)
# ---------------------------------------------------------------------------

OTP_REGISTER = "otp:register:{mobile}"
OTP_RESET = "otp:reset:{mobile}"
OTP_EMAIL_VERIFY = "otp:email_verify:{mobile}"
OTP_EMAIL_VERIFY_TARGET = "otp:email_verify_target:{mobile}"
OTP_RESEND = "otp_resend:{mobile}"
OTP_LOCK = "otp_lock:{mobile}"
OTP_RATE = "otp_rate:{mobile}"
OTP_RATE_IP = "otp_rate_ip:{ip}"
LOGIN_FAIL = "login_fail:{mobile}"
LOGIN_LOCK = "login_lock:{mobile}"
# Per-IP failed-login counter: the per-mobile lock alone lets one host spray a
# credential list across many numbers (max 4 tries each) without ever locking.
LOGIN_RATE_IP = "login_rate_ip:{ip}"
# Public lead-form abuse caps (unauthenticated write → both dimensions needed:
# per-IP stops one host flooding, per-mobile stops one number being spammed
# into the telecaller queue from many hosts).
LEAD_RATE_IP = "lead_rate_ip:{ip}"
LEAD_RATE_MOBILE = "lead_rate_mobile:{mobile}"
CONTACT_INVITATION_RATE_IP = "contact_invitation_rate_ip:{ip}"
JWT_BLACKLIST = "jwt_blacklist:{jti}"
REG_DATA = "reg_data:{mobile}"

# Public agent-application intake (POST /api/v1/agent-applications). OTP_AGENT_APPLY
# shares the otp:* purpose-key family (see services/otp.py::_otp_key) and the
# existing otp_rate/otp_rate_ip daily+per-IP OTP budgets — deliberately: one
# attacker budget across register/reset/agent_apply. AGENT_APPLY_RATE_IP is a
# separate per-IP cap on the *submit* call (distinct from the OTP-initiate
# caps above). AGENT_APPLY_PRESIGN is a per-ticket (per-jti) quota on the
# upload-presign call, capping retries at 4 documents x up to 3 attempts each.
# AGENT_APPLY_OTP_DAILY is an ADDITIONAL purpose-scoped daily cap on top of the
# shared otp_rate/{mobile} budget: this route is the first unauthenticated
# endpoint reachable with only a target mobile number, so without its own cap
# an attacker could burn a victim's entire shared daily OTP budget through
# this route alone (security review finding, 2026-07-26).
# Owner: services/agent_applications.py. Invalidation: OTP_AGENT_APPLY is
# burned by verify_otp on success; AGENT_APPLY_PRESIGN expires with the
# ticket's own TTL; AGENT_APPLY_RATE_IP and AGENT_APPLY_OTP_DAILY are plain
# rolling windows.
OTP_AGENT_APPLY = "otp:agent_apply:{mobile}"
AGENT_APPLY_RATE_IP = "agent_apply_rate_ip:{ip}"
AGENT_APPLY_OTP_DAILY = "agent_apply_otp_daily:{mobile}"
AGENT_APPLY_PRESIGN = "agent_apply_presign:{jti}"

# Support-assisted mobile-number recovery.  OTP is keyed to the replacement
# number; the initiation counter also includes the claimed current number so a
# caller cannot flood the support queue for one account from many networks.
OTP_MOBILE_CHANGE = "otp:mobile_change:{mobile}"
MOBILE_CHANGE_RATE_IP = "mobile_change_rate_ip:{ip}"
MOBILE_CHANGE_RATE_ACCOUNT = "mobile_change_rate_account:{mobile}"
MOBILE_CHANGE_OTP_DAILY = "mobile_change_otp_daily:{mobile}"

# Admin broadcast (services/admin_notify.py::broadcast) — one send per admin
# per ADMIN_BROADCAST_RATE_LIMIT_MINUTES window. A broadcast has no undo, so
# this exists specifically to catch a double-clicked send, not general abuse.
ADMIN_BROADCAST_RATE = "admin_broadcast_rate:{admin_uuid}"

# Authenticated managed property-media uploads. The owner UUID binds both the
# Redis quota and the private object-key prefix; orphan cleanup is storage-side.
PROPERTY_MEDIA_PRESIGN = "property_media_presign:{owner_uuid}"

# Authenticated Loans media uploads. The authenticated account owns the quota;
# the private object key separately binds the client profile and application.
LOAN_MEDIA_PRESIGN = "loan_media_presign:{owner_uuid}"

# Assigned-Employee private site-visit feedback uploads.
TASK_FEEDBACK_MEDIA_PRESIGN = "task_feedback_media_presign:{owner_uuid}"
# Employee document-collection uploads. Per-account rather than per-task so a
# compromised Employee session cannot fan out across many assigned tasks.
TASK_DOCUMENT_PRESIGN = "task_document_presign:{owner_uuid}"
TASK_DOCUMENT_UPLOAD = "task_document_upload:{object_key_hash}"

# Authenticated coarse-location refreshes. Every capture follows an explicit
# settings action, while this budget bounds retries and write amplification per
# account.
PERSONALIZATION_LOCATION_CAPTURE = "personalization_location_capture:{owner_uuid}"

# TTLs in seconds
TTL_OTP = 5 * 60  # 5 min
TTL_OTP_RESEND = 60 * 60  # 1 hour window + lock duration
TTL_OTP_RATE = 24 * 60 * 60  # 24 h daily cap
TTL_OTP_RATE_IP = 60 * 60  # 1 h rolling per-IP window
TTL_LOGIN_LOCK = 15 * 60  # 15 min lockout
TTL_LOGIN_RATE_IP = 60 * 60  # 1 h rolling per-IP failed-login window
TTL_LEAD_RATE = 60 * 60  # 1 h rolling window, both lead-form caps
TTL_CONTACT_INVITATION_RATE = 60 * 60  # 1 h public token-validation window
TTL_AGENT_APPLY_RATE = 60 * 60  # 1 h rolling window, submit per-IP cap
TTL_AGENT_APPLY_PRESIGN = 15 * 60  # matches the ticket's own 15 min exp
TTL_AGENT_APPLY_OTP_DAILY = 24 * 60 * 60  # 24 h daily cap, purpose-scoped
TTL_MOBILE_CHANGE_RATE = 60 * 60
TTL_MOBILE_CHANGE_OTP_DAILY = 24 * 60 * 60
TTL_PROPERTY_MEDIA_PRESIGN = 60 * 60
TTL_LOAN_MEDIA_PRESIGN = 60 * 60
TTL_TASK_FEEDBACK_MEDIA_PRESIGN = 60 * 60
TTL_TASK_DOCUMENT_PRESIGN = 60 * 60
TTL_TASK_DOCUMENT_UPLOAD = 10 * 60
TTL_PERSONALIZATION_LOCATION_CAPTURE = 60 * 60


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class RedisCache:
    """Thin wrapper around redis.asyncio client with typed helpers."""

    def __init__(self, client: aioredis.Redis) -> None:
        self._r = client

    async def get(self, key: str) -> str | None:
        return await self._r.get(key)

    async def getdel(self, key: str) -> str | None:
        """Atomically consume a single-use value (Redis 6.2+ GETDEL)."""
        return await self._r.getdel(key)

    async def set(self, key: str, value: Any, ttl: int) -> None:
        await self._r.set(key, str(value), ex=ttl)

    async def delete(self, *keys: str) -> None:
        if keys:
            await self._r.delete(*keys)

    async def exists(self, key: str) -> bool:
        return bool(await self._r.exists(key))

    async def ttl(self, key: str) -> int:
        """Returns remaining TTL in seconds, -2 if key missing, -1 if no expiry."""
        return await self._r.ttl(key)

    async def incr(self, key: str) -> int:
        return await self._r.incr(key)

    async def expire(self, key: str, ttl: int) -> None:
        await self._r.expire(key, ttl)

    async def incr_with_expire(self, key: str, ttl: int) -> int:
        """INCR then set TTL only on first increment (window-start pattern)."""
        count: int = await self._r.incr(key)
        if count == 1:
            await self._r.expire(key, ttl)
        return count

    async def decr(self, key: str) -> int:
        """Atomic DECR; the returned value is the caller's authoritative gate.

        Redis treats a missing key as 0, so DECR on an expired counter returns
        -1 (and recreates the key with no TTL — callers must re-bound it).
        """
        return await self._r.decr(key)

    async def set_nx(self, key: str, value: Any, ttl: int) -> bool:
        """Atomic SET-if-absent with TTL. True = claimed, False = already set.

        Single-use claims (reset-token jti burn) must be one Redis op; a
        separate EXISTS check then SET lets two concurrent requests both pass.
        """
        return bool(await self._r.set(key, str(value), ex=ttl, nx=True))


def otp_register_key(mobile: str) -> str:
    return OTP_REGISTER.format(mobile=mobile)


def otp_reset_key(mobile: str) -> str:
    return OTP_RESET.format(mobile=mobile)


def otp_email_verify_key(mobile: str) -> str:
    return OTP_EMAIL_VERIFY.format(mobile=mobile)


def otp_email_verify_target_key(mobile: str) -> str:
    return OTP_EMAIL_VERIFY_TARGET.format(mobile=mobile)


def otp_resend_key(mobile: str) -> str:
    return OTP_RESEND.format(mobile=mobile)


def otp_lock_key(mobile: str) -> str:
    return OTP_LOCK.format(mobile=mobile)


def otp_rate_key(mobile: str) -> str:
    return OTP_RATE.format(mobile=mobile)


def otp_rate_ip_key(ip: str) -> str:
    return OTP_RATE_IP.format(ip=ip)


def login_fail_key(mobile: str) -> str:
    return LOGIN_FAIL.format(mobile=mobile)


def login_lock_key(mobile: str) -> str:
    return LOGIN_LOCK.format(mobile=mobile)


def login_rate_ip_key(ip: str) -> str:
    return LOGIN_RATE_IP.format(ip=ip)


def lead_rate_ip_key(ip: str) -> str:
    return LEAD_RATE_IP.format(ip=ip)


def lead_rate_mobile_key(mobile: str) -> str:
    return LEAD_RATE_MOBILE.format(mobile=mobile)


def contact_invitation_rate_ip_key(ip: str) -> str:
    return CONTACT_INVITATION_RATE_IP.format(ip=ip)


def jwt_blacklist_key(jti: str) -> str:
    return JWT_BLACKLIST.format(jti=jti)


def reg_data_key(mobile: str) -> str:
    return REG_DATA.format(mobile=mobile)


def otp_agent_apply_key(mobile: str) -> str:
    return OTP_AGENT_APPLY.format(mobile=mobile)


def otp_mobile_change_key(mobile: str) -> str:
    return OTP_MOBILE_CHANGE.format(mobile=mobile)


def agent_apply_rate_ip_key(ip: str) -> str:
    return AGENT_APPLY_RATE_IP.format(ip=ip)


def agent_apply_presign_key(jti: str) -> str:
    return AGENT_APPLY_PRESIGN.format(jti=jti)


def property_media_presign_key(owner_uuid: str) -> str:
    return PROPERTY_MEDIA_PRESIGN.format(owner_uuid=owner_uuid)


def loan_media_presign_key(owner_uuid: str) -> str:
    return LOAN_MEDIA_PRESIGN.format(owner_uuid=owner_uuid)


def task_feedback_media_presign_key(owner_uuid: str) -> str:
    return TASK_FEEDBACK_MEDIA_PRESIGN.format(owner_uuid=owner_uuid)


def task_document_presign_key(owner_uuid: str) -> str:
    return TASK_DOCUMENT_PRESIGN.format(owner_uuid=owner_uuid)


def task_document_upload_key(object_key: str) -> str:
    digest = hashlib.sha256(object_key.encode("utf-8")).hexdigest()
    return TASK_DOCUMENT_UPLOAD.format(object_key_hash=digest)


def personalization_location_capture_key(owner_uuid: str) -> str:
    return PERSONALIZATION_LOCATION_CAPTURE.format(owner_uuid=owner_uuid)


def agent_apply_otp_daily_key(mobile: str) -> str:
    return AGENT_APPLY_OTP_DAILY.format(mobile=mobile)


def mobile_change_rate_ip_key(ip: str) -> str:
    return MOBILE_CHANGE_RATE_IP.format(ip=ip)


def mobile_change_rate_account_key(mobile: str) -> str:
    return MOBILE_CHANGE_RATE_ACCOUNT.format(mobile=mobile)


def mobile_change_otp_daily_key(mobile: str) -> str:
    return MOBILE_CHANGE_OTP_DAILY.format(mobile=mobile)
