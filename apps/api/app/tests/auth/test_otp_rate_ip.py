"""Per-IP OTP initiation rate-limit tests (audit finding S5).

One host must not be able to iterate mobile numbers and burn voice-call / email
spend. The per-mobile daily cap does not stop that — each number is fresh — so a
per-IP cap gates the initiate endpoints regardless of mobile.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
import redis.asyncio as aioredis
from httpx import AsyncClient

from app.cache.redis_keys import otp_rate_ip_key
from app.core.config import settings
from conftest import unique_email, unique_mobile

# ASGITransport stamps every request with this client host.
_TEST_IP = "127.0.0.1"


async def _initiate(client: AsyncClient) -> int:
    resp = await client.post(
        "/api/v1/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": unique_mobile(),
            "email": unique_email(),
            "service_lines": ["loans"],
        },
    )
    return resp.status_code


@pytest.fixture
async def _low_ip_limit():
    """Force a low per-IP cap and clear the shared counter for a clean window."""
    original = settings.OTP_RATE_LIMIT_PER_IP
    settings.OTP_RATE_LIMIT_PER_IP = 3
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.delete(otp_rate_ip_key(_TEST_IP))
    try:
        yield
    finally:
        await r.delete(otp_rate_ip_key(_TEST_IP))
        await r.aclose()
        settings.OTP_RATE_LIMIT_PER_IP = original


async def test_initiate_blocked_after_ip_cap(client: AsyncClient, _low_ip_limit) -> None:
    # Up to the cap (3) succeeds, each with a distinct mobile so the per-mobile
    # daily cap never fires — only the per-IP cap can trip.
    for _ in range(3):
        assert await _initiate(client) == 200
    # The 4th initiate from the same IP is rejected.
    assert await _initiate(client) == 429


async def test_ip_cap_does_not_leak_across_reset(client: AsyncClient, _low_ip_limit) -> None:
    for _ in range(3):
        assert await _initiate(client) == 200
    assert await _initiate(client) == 429
    # Clearing the counter (window roll) restores service.
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.delete(otp_rate_ip_key(_TEST_IP))
    await r.aclose()
    assert await _initiate(client) == 200
