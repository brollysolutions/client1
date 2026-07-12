"""Redis key namespace constants and typed helpers (Auth Design §8)."""

from __future__ import annotations

from typing import Any

import redis.asyncio as aioredis

# ---------------------------------------------------------------------------
# Key templates  (Auth Design §8 — exact names, locked scope)
# ---------------------------------------------------------------------------

OTP_REGISTER = "otp:register:{mobile}"
OTP_RESET = "otp:reset:{mobile}"
OTP_EMAIL_VERIFY = "otp:email_verify:{mobile}"
OTP_RESEND = "otp_resend:{mobile}"
OTP_LOCK = "otp_lock:{mobile}"
OTP_RATE = "otp_rate:{mobile}"
OTP_RATE_IP = "otp_rate_ip:{ip}"
LOGIN_FAIL = "login_fail:{mobile}"
LOGIN_LOCK = "login_lock:{mobile}"
# Per-IP failed-login counter: the per-mobile lock alone lets one host spray a
# credential list across many numbers (max 4 tries each) without ever locking.
LOGIN_RATE_IP = "login_rate_ip:{ip}"
JWT_BLACKLIST = "jwt_blacklist:{jti}"
REG_DATA = "reg_data:{mobile}"

# TTLs in seconds
TTL_OTP = 5 * 60  # 5 min
TTL_OTP_RESEND = 60 * 60  # 1 hour window + lock duration
TTL_OTP_RATE = 24 * 60 * 60  # 24 h daily cap
TTL_OTP_RATE_IP = 60 * 60  # 1 h rolling per-IP window
TTL_LOGIN_LOCK = 15 * 60  # 15 min lockout
TTL_LOGIN_RATE_IP = 60 * 60  # 1 h rolling per-IP failed-login window


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class RedisCache:
    """Thin wrapper around redis.asyncio client with typed helpers."""

    def __init__(self, client: aioredis.Redis) -> None:
        self._r = client

    async def get(self, key: str) -> str | None:
        return await self._r.get(key)

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


def jwt_blacklist_key(jti: str) -> str:
    return JWT_BLACKLIST.format(jti=jti)


def reg_data_key(mobile: str) -> str:
    return REG_DATA.format(mobile=mobile)
