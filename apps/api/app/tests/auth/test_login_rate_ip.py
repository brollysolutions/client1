"""Per-IP failed-login throttle tests (2026-07-13 security audit P1).

The per-mobile lock (5 fails / 15 min) never fires for an attacker spraying a
credential list across many numbers, 4 tries each, from one host. The per-IP
failed-login counter is that backstop: only failures count, so shared NAT IPs
with normal successful traffic are unaffected.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
import redis.asyncio as aioredis
from httpx import AsyncClient

from app.cache.redis_keys import login_rate_ip_key
from app.core.config import settings
from conftest import unique_mobile

# ASGITransport stamps every request with this client host.
_TEST_IP = "127.0.0.1"


async def _login(client: AsyncClient, mobile: str) -> int:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"mobile": mobile, "password": "definitely-wrong-Aa1!"},
    )
    return resp.status_code


@pytest.fixture
async def _low_login_ip_limit():
    """Force a low per-IP cap and clear the shared counter for a clean window."""
    original = settings.LOGIN_RATE_LIMIT_PER_IP
    settings.LOGIN_RATE_LIMIT_PER_IP = 3
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.delete(login_rate_ip_key(_TEST_IP))
    try:
        yield
    finally:
        await r.delete(login_rate_ip_key(_TEST_IP))
        await r.aclose()
        settings.LOGIN_RATE_LIMIT_PER_IP = original


async def test_login_blocked_after_ip_fail_cap(client: AsyncClient, _low_login_ip_limit) -> None:
    # Each failure uses a DIFFERENT unknown mobile, so the per-mobile lock
    # never binds — exactly the spraying pattern the per-IP cap exists for.
    for _ in range(3):
        assert await _login(client, unique_mobile()) == 401
    # Cap reached: the next attempt from this IP is rejected before password
    # verification regardless of which mobile it names.
    assert await _login(client, unique_mobile()) == 429


async def test_ip_fail_cap_recovers_after_window(client: AsyncClient, _low_login_ip_limit) -> None:
    for _ in range(3):
        assert await _login(client, unique_mobile()) == 401
    assert await _login(client, unique_mobile()) == 429
    # Window roll (counter expiry) restores service.
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.delete(login_rate_ip_key(_TEST_IP))
    await r.aclose()
    assert await _login(client, unique_mobile()) == 401
