"""Top-level pytest fixtures and shared helpers — app lifespan + test DB/Redis."""

from __future__ import annotations

import contextlib
import os
import uuid

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app
from app.scripts.seed_helpers import dev_indian_mobile

# ---------------------------------------------------------------------------
# NullPool patch — must run before any test touches the DB
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def _force_mock_otp_channels() -> None:
    """Tests must never place real voice calls or send real email.

    .env.local may carry a real TWOFACTOR_API_KEY; force mock mode so deliver_otp
    returns 'none' (and otp_hint) without hitting the network. Email is already
    mock (no SMTP creds) but we pin it for determinism.
    """
    settings.VOICE_OTP_ENABLED = False
    settings.TWOFACTOR_API_KEY = ""
    settings.EMAIL_ENABLED = False
    settings.SMTP_HOST = ""
    # otp_hint is now gated on an explicit opt-in flag (fail-closed, audit L3), so
    # pin it on here rather than relying on ENV=="development" for the hint to
    # appear in test responses.
    settings.OTP_EXPOSE_HINT = True
    # Every ASGITransport request shares one client IP (127.0.0.1) and Redis is not
    # flushed between tests, so the real per-IP OTP cap would trip mid-suite. Raise
    # it out of the way here; test_otp_rate_ip.py drives the cap explicitly with a
    # low override + a flushed key.
    settings.OTP_RATE_LIMIT_PER_IP = 1_000_000
    # The mobile-change integration module likewise exercises many independent
    # accounts through ASGITransport's one synthetic IP. Its purpose-specific
    # per-account limits remain active; only the cross-test IP aggregate is
    # raised here because that module has no rate-limit assertions of its own.
    settings.MOBILE_CHANGE_RATE_LIMIT_PER_IP = 1_000_000


@pytest.fixture(scope="session", autouse=True)
def _patch_db_null_pool() -> None:
    """Replace the module-level SQLAlchemy engine+session with a NullPool version.

    AsyncAdaptedQueuePool retains connections bound to the previous test's event
    loop.  When the next test starts a fresh loop the pool teardown fires
    "RuntimeError: Event loop is closed".  NullPool creates and destroys a real
    connection on every request, so nothing lingers between tests.
    """
    import app.db.session as _session_mod

    # Bypass pgBouncer for tests: transaction-mode pooling + asyncpg + NullPool churn
    # intermittently yields "connection was closed in the middle of operation". Connect
    # straight to Postgres (same as alembic env.py) for deterministic integration tests.
    test_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    test_engine = create_async_engine(
        test_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )
    import app.services.agent_applications as _agent_applications_mod
    import app.services.banners as _banners_mod
    import app.services.leads as _leads_mod
    import app.services.mobile_change as _mobile_change_mod
    import app.services.notifications as _notifications_mod
    import app.services.payments as _payments_mod
    import app.services.payout_recipients as _payout_recipients_mod
    import app.services.property_submissions as _psub_mod
    import app.services.push as _push_mod

    original = _session_mod.AsyncSessionLocal
    null_pool_sessionmaker = async_sessionmaker(
        bind=test_engine,
        expire_on_commit=False,
        autoflush=False,
    )
    _session_mod.AsyncSessionLocal = null_pool_sessionmaker
    # leads.py, notifications.py and payments.py each did `from app.db.session
    # import AsyncSessionLocal`, binding the original at import time — rebind their
    # copies too so lead capture, notification emission and payout writes use the
    # NullPool engine in tests.
    original_leads = _leads_mod.AsyncSessionLocal
    _leads_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_notifications = _notifications_mod.AsyncSessionLocal
    _notifications_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_payments = _payments_mod.AsyncSessionLocal
    _payments_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_payout_recipients = _payout_recipients_mod.AsyncSessionLocal
    _payout_recipients_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_psub = _psub_mod.AsyncSessionLocal
    _psub_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_banners = _banners_mod.AsyncSessionLocal
    _banners_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_push = _push_mod.AsyncSessionLocal
    _push_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_agent_applications = _agent_applications_mod.AsyncSessionLocal
    _agent_applications_mod.AsyncSessionLocal = null_pool_sessionmaker
    original_mobile_change = _mobile_change_mod.AsyncSessionLocal
    _mobile_change_mod.AsyncSessionLocal = null_pool_sessionmaker
    yield
    _session_mod.AsyncSessionLocal = original
    _leads_mod.AsyncSessionLocal = original_leads
    _notifications_mod.AsyncSessionLocal = original_notifications
    _payments_mod.AsyncSessionLocal = original_payments
    _payout_recipients_mod.AsyncSessionLocal = original_payout_recipients
    _psub_mod.AsyncSessionLocal = original_psub
    _banners_mod.AsyncSessionLocal = original_banners
    _push_mod.AsyncSessionLocal = original_push
    _agent_applications_mod.AsyncSessionLocal = original_agent_applications
    _mobile_change_mod.AsyncSessionLocal = original_mobile_change


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PASSWORD = "Test@1234"


def unique_mobile() -> str:
    """E.164 Indian mobile — unique per call, avoids cross-test DB collisions."""
    return dev_indian_mobile()


def unique_email() -> str:
    """Unique email — avoids cross-test UNIQUE collisions on auth_users.email."""
    return f"test_{uuid.uuid4().hex[:12]}@example.com"


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
        # In CI the services are declared, so an unreachable Redis means the wiring
        # is broken — fail loudly instead of silently skipping the whole suite (the
        # bug that let the RLS / refresh-rotation tests pass without ever running).
        if os.environ.get("CI"):
            pytest.fail(
                "Redis unreachable under CI — integration tests must run, not skip. "
                "Check the service containers and REDIS_URL.",
                pytrace=False,
            )
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
    email: str | None = None,
    referral_code: str | None = None,
) -> str:
    """POST register/initiate, return OTP hint. Asserts 200 and mock mode."""
    body = {
        "first_name": "Test",
        "last_name": "User",
        "mobile": mobile,
        "service_lines": lines or ["loans"],
    }
    if referral_code is not None:
        body["referral_code"] = referral_code
    resp = await client.post("/api/v1/auth/register/initiate", json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Mock mode (no voice/email creds) → no channel delivered, OTP returned as hint.
    assert data["delivery_channel"] == "none"
    otp: str = data["otp_hint"]
    assert len(otp) == 6
    return otp


async def full_registration(
    client: AsyncClient,
    mobile: str | None = None,
    password: str = PASSWORD,
    lines: list[str] | None = None,
    email: str | None = None,
    referral_code: str | None = None,
) -> tuple[str, str]:
    """Complete 3-step registration. Returns (access_token, mobile)."""
    if mobile is None:
        mobile = unique_mobile()
    otp = await initiate_and_get_otp(client, mobile, lines, email, referral_code)

    verify_resp = await client.post(
        "/api/v1/auth/register/verify-otp",
        json={"mobile": mobile, "otp": otp},
    )
    assert verify_resp.status_code == 200, verify_resp.text
    reg_token = verify_resp.json()["registration_token"]

    set_pw_resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={
            "registration_token": reg_token,
            "password": password,
            "confirm_password": password,
        },
    )
    assert set_pw_resp.status_code == 201, set_pw_resp.text
    access_token = set_pw_resp.json()["access_token"]
    if email is not None:
        profile_resp = await client.patch(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"first_name": "Test", "last_name": "User", "email": email},
        )
        assert profile_resp.status_code == 200, profile_resp.text
    return access_token, mobile


async def do_login(
    client: AsyncClient,
    mobile: str,
    password: str = PASSWORD,
) -> str:
    """POST /auth/login, return access_token. Asserts 200."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"mobile": mobile, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]
