"""Top-level pytest fixtures — app lifespan + test DB/Redis."""

from __future__ import annotations

import contextlib

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

from app.core.config import settings
from app.main import app


async def _redis_reachable() -> bool:
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        await r.ping()
        await r.aclose()
        return True
    except Exception:
        return False


@pytest_asyncio.fixture
async def live_app():
    """
    Bootstrap app.state.redis. Skip the test if Redis is not reachable.
    Use this fixture in tests that need running Docker services (Postgres + Redis).
    """
    if not await _redis_reachable():
        pytest.skip("Redis not reachable — start Docker stack to run integration tests")

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    app.state.redis = redis_client
    try:
        yield app
    finally:
        await redis_client.aclose()
        with contextlib.suppress(AttributeError):
            del app.state.redis
