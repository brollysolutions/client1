"""Top-level pytest fixtures and shared helpers — app lifespan + test DB/Redis."""

from __future__ import annotations

import contextlib
import uuid

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app

# ---------------------------------------------------------------------------
# NullPool patch — must run before any test touches the DB
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def _patch_db_null_pool() -> None:
    """Replace the module-level SQLAlchemy engine+session with a NullPool version.

    AsyncAdaptedQueuePool retains connections bound to the previous test's event
    loop.  When the next test starts a fresh loop the pool teardown fires
    "RuntimeError: Event loop is closed".  NullPool creates and destroys a real
    connection on every request, so nothing lingers between tests.
    """
    import app.db.session as _session_mod

    test_engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )
    original = _session_mod.AsyncSessionLocal
    _session_mod.AsyncSessionLocal = async_sessionmaker(
        bind=test_engine,
        expire_on_commit=False,
        autoflush=False,
    )
    yield
    _session_mod.AsyncSessionLocal = original


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PASSWORD = "Test@1234"


def unique_mobile() -> str:
    """E.164 Indian mobile — unique per call, avoids cross-test DB collisions."""
    n = uuid.uuid4().int % 900_000_000 + 100_000_000
    return f"+91{n}"


# ---------------------------------------------------------------------------
# Service availability
# ---------------------------------------------------------------------------


async def _redis_reachable() -> bool:
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        await r.ping()
        await r.aclose()
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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


@pytest_asyncio.fixture
async def client(live_app):
    """Integration-test client — requires running Docker services (Redis + Postgres).
    Tests skip automatically when services are unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=live_app),
        base_url="https://test",
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# Shared async helpers — imported by test files
# ---------------------------------------------------------------------------


async def initiate_and_get_otp(
    client: AsyncClient,
    mobile: str,
    lines: list[str] | None = None,
) -> str:
    """POST register/initiate, return OTP hint. Asserts 200 and mock mode."""
    resp = await client.post(
        "/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": mobile,
            "lines": lines or ["loans"],
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["sms_sent"] is False
    otp: str = data["otp_hint"]
    assert len(otp) == 6
    return otp


async def full_registration(
    client: AsyncClient,
    mobile: str | None = None,
    password: str = PASSWORD,
    lines: list[str] | None = None,
) -> tuple[str, str]:
    """Complete 3-step registration. Returns (access_token, mobile)."""
    if mobile is None:
        mobile = unique_mobile()
    otp = await initiate_and_get_otp(client, mobile, lines)

    verify_resp = await client.post(
        "/auth/register/verify-otp",
        json={"mobile": mobile, "otp": otp},
    )
    assert verify_resp.status_code == 200, verify_resp.text
    reg_token = verify_resp.json()["registration_token"]

    set_pw_resp = await client.post(
        "/auth/register/set-password",
        json={
            "registration_token": reg_token,
            "password": password,
            "confirm_password": password,
        },
    )
    assert set_pw_resp.status_code == 201, set_pw_resp.text
    return set_pw_resp.json()["access_token"], mobile


async def do_login(
    client: AsyncClient,
    mobile: str,
    password: str = PASSWORD,
) -> str:
    """POST /auth/login, return access_token. Asserts 200."""
    resp = await client.post(
        "/auth/login",
        json={"mobile": mobile, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]
