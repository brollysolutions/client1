"""OTP generation, storage, verification, and rate-limiting (Auth Design §8)."""

from __future__ import annotations

import logging
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, status

from app.cache.redis_keys import (
    TTL_LOGIN_LOCK,
    TTL_OTP,
    TTL_OTP_RATE,
    TTL_OTP_RESEND,
    RedisCache,
    login_fail_key,
    login_lock_key,
    otp_lock_key,
    otp_rate_key,
    otp_register_key,
    otp_resend_key,
    otp_reset_key,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

_ph = PasswordHasher()

_OTP_RATE_DAILY_MAX = 5
_RESEND_LIMIT = 3
_LOGIN_FAIL_MAX = 5


def _otp_key(mobile: str, purpose: str) -> str:
    if purpose == "register":
        return otp_register_key(mobile)
    if purpose == "reset":
        return otp_reset_key(mobile)
    raise ValueError(f"Unknown OTP purpose: {purpose}")


async def generate_and_store_otp(cache: RedisCache, mobile: str, purpose: str) -> str:
    """Generate 6-digit OTP, hash+store in Redis, return plaintext."""
    await check_otp_rate(cache, mobile)
    otp = f"{secrets.randbelow(10**6):06d}"
    otp_hash = _ph.hash(otp)
    key = _otp_key(mobile, purpose)
    attempts_key = f"{key}:attempts"
    await cache.set(key, otp_hash, TTL_OTP)
    await cache.set(attempts_key, settings.OTP_MAX_ATTEMPTS, TTL_OTP)
    logger.debug("otp.generated mobile=%s purpose=%s", mobile, purpose)
    return otp


async def verify_otp(cache: RedisCache, mobile: str, purpose: str, code: str) -> None:
    """Verify OTP. Raises 400 on wrong/expired/exceeded. Burns OTP on success."""
    key = _otp_key(mobile, purpose)
    attempts_key = f"{key}:attempts"

    stored_hash = await cache.get(key)
    if stored_hash is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired or not found. Request a new one.",
        )

    remaining_str = await cache.get(attempts_key)
    remaining = int(remaining_str) if remaining_str else 0
    if remaining <= 0:
        await cache.delete(key, attempts_key)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP attempts exhausted. Request a new one.",
        )

    try:
        _ph.verify(stored_hash, code)
    except VerifyMismatchError as exc:
        new_remaining = remaining - 1
        if new_remaining <= 0:
            await cache.delete(key, attempts_key)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect OTP. No attempts remaining. Request a new one.",
            ) from exc
        await cache.set(attempts_key, new_remaining, TTL_OTP)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect OTP. {new_remaining} attempt(s) remaining.",
        ) from exc

    # Success — burn the OTP
    await cache.delete(key, attempts_key, otp_resend_key(mobile), otp_lock_key(mobile))
    logger.debug("otp.verified mobile=%s purpose=%s", mobile, purpose)


async def resend_otp(cache: RedisCache, mobile: str, purpose: str) -> str:
    """Resend OTP. Max 3 resends per window, then 1-hour lock (Auth Design §8)."""
    otp_key = otp_register_key(mobile) if purpose == "register" else otp_reset_key(mobile)
    if not await cache.exists(otp_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active OTP session. Please initiate first.",
        )

    lock_key = otp_lock_key(mobile)
    if await cache.exists(lock_key):
        ttl = await cache.ttl(lock_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many OTP requests. Try again in {max(ttl // 60, 1)} min.",
        )

    count = await cache.incr_with_expire(otp_resend_key(mobile), TTL_OTP_RESEND)
    if count > _RESEND_LIMIT:
        await cache.set(lock_key, 1, TTL_OTP_RESEND)
        await cache.delete(otp_resend_key(mobile))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many resends. Try again in 1 hour.",
        )

    return await generate_and_store_otp(cache, mobile, purpose)


async def check_otp_rate(cache: RedisCache, mobile: str) -> None:
    """Daily OTP cap (5/day). Raises 429 if exceeded."""
    count = await cache.incr_with_expire(otp_rate_key(mobile), TTL_OTP_RATE)
    if count > _OTP_RATE_DAILY_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily OTP limit reached. Try again tomorrow.",
        )


async def record_login_failure(cache: RedisCache, mobile: str) -> None:
    """Increment login failure counter. Lock account on 5th failure (Auth Design §6.6)."""
    fail_key = login_fail_key(mobile)
    lock_key = login_lock_key(mobile)
    count = await cache.incr_with_expire(fail_key, TTL_LOGIN_LOCK)
    if count >= _LOGIN_FAIL_MAX:
        await cache.set(lock_key, 1, TTL_LOGIN_LOCK)
        await cache.delete(fail_key)
        logger.warning("login.locked mobile=%s", mobile)


async def check_login_lock(cache: RedisCache, mobile: str) -> None:
    """Raises 429 if login is locked."""
    lock_key = login_lock_key(mobile)
    if await cache.exists(lock_key):
        ttl = await cache.ttl(lock_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked. Try again in {max(ttl // 60, 1)} min.",
        )


async def clear_login_failures(cache: RedisCache, mobile: str) -> None:
    """Clear login failure counter on successful login."""
    await cache.delete(login_fail_key(mobile), login_lock_key(mobile))
