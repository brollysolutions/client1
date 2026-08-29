"""Login integration tests.

Covers POST /auth/login.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.schemas.auth import LoginRequest
from app.services import auth_service
from conftest import PASSWORD, full_registration, unique_mobile


async def _lead_exists(mobile: str) -> bool:
    """Query the leads table directly (own session bypasses RLS as app superuser)."""
    import app.db.session as _session_mod
    from app.models.lead import Lead

    async with _session_mod.AsyncSessionLocal() as session:
        row = await session.scalar(select(Lead).where(Lead.mobile == mobile))
        return row is not None


async def test_login_valid_credentials_returns_200(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 200


async def test_login_response_has_access_token(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.json()["access_token"]


async def test_login_token_type_is_bearer(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.json()["token_type"] == "bearer"


async def test_login_expires_in_matches_config(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.json()["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


async def test_login_refresh_cookie_set(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    set_cookie = resp.headers.get("set-cookie", "")
    cookie = set_cookie.lower()
    assert "refresh_token" in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=strict" in cookie
    assert "path=/api/v1/auth/refresh" in cookie
    assert "domain=" not in cookie


async def test_login_wrong_password_returns_401(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/login", json={"mobile": mobile, "password": "Wrong@9999"}
    )
    assert resp.status_code == 401


async def test_login_error_message_is_generic(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/login", json={"mobile": mobile, "password": "Wrong@9999"}
    )
    assert "invalid" in resp.json()["detail"].lower()


async def test_login_unknown_mobile_returns_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/login", json={"mobile": unique_mobile(), "password": PASSWORD}
    )
    assert resp.status_code == 401


async def test_login_unknown_and_wrong_pw_same_message(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    wrong_pw = await client.post(
        "/api/v1/auth/login", json={"mobile": mobile, "password": "Wrong@9"}
    )
    unknown = await client.post(
        "/api/v1/auth/login", json={"mobile": unique_mobile(), "password": PASSWORD}
    )
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


async def test_login_unknown_and_wrong_password_both_verify_one_hash(
    monkeypatch,
) -> None:
    """Generic copy must not leave an Argon2 timing oracle for account existence."""
    mobile = unique_mobile()
    unknown_mobile = unique_mobile()
    verification_hashes: list[str] = []
    mobile_failures: list[str] = []
    failed_events: list[dict[str, object]] = []

    class _LoginDb:
        def __init__(self) -> None:
            self.users = [
                SimpleNamespace(id=uuid4(), password_hash="$argon2id$known-account-hash"),
                None,
            ]

        async def scalar(self, _query):
            return self.users.pop(0)

    async def _noop(*_args, **_kwargs) -> None:
        return None

    async def _record_verification(_password: str, password_hash: str) -> bool:
        verification_hashes.append(password_hash)
        return False

    async def _record_mobile_failure(_cache, failed_mobile: str) -> None:
        mobile_failures.append(failed_mobile)

    async def _record_event(_db, **event: object) -> None:
        failed_events.append(event)

    monkeypatch.setattr(auth_service, "verify_password", _record_verification)
    monkeypatch.setattr(auth_service, "_log_event", _record_event)
    monkeypatch.setattr(auth_service, "check_login_lock", _noop)
    monkeypatch.setattr(auth_service, "check_login_rate_ip", _noop)
    monkeypatch.setattr(auth_service, "record_login_failure", _record_mobile_failure)
    monkeypatch.setattr(auth_service, "record_login_failure_ip", _noop)

    db = _LoginDb()
    failures: list[HTTPException] = []
    for request in (
        LoginRequest(mobile=mobile, password="Wrong@9"),
        LoginRequest(mobile=unknown_mobile, password=PASSWORD),
    ):
        with pytest.raises(HTTPException) as raised:
            await auth_service.login(db, object(), request)
        failures.append(raised.value)

    assert [failure.status_code for failure in failures] == [401, 401]
    assert failures[0].detail == failures[1].detail
    assert len(verification_hashes) == 2
    assert all(password_hash.startswith("$argon2id$") for password_hash in verification_hashes)
    assert mobile_failures == [mobile, unknown_mobile]
    assert len(failed_events) == 2
    assert all(event["event_type"] == "login_fail" for event in failed_events)
    assert all(event["success"] is False for event in failed_events)
    assert failed_events[0]["auth_user_uuid"] is not None
    assert failed_events[1]["auth_user_uuid"] is None


async def test_login_lockout_after_5_failures_returns_429(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    for _ in range(5):
        await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "Wrong@9"})
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 429


async def test_login_correct_on_4th_failure_succeeds(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    for _ in range(4):
        await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "Wrong@9"})
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 200


async def test_login_invalid_mobile_format_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/login", json={"mobile": "9876543210", "password": PASSWORD}
    )
    assert resp.status_code == 422


async def test_login_missing_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/login", json={"password": PASSWORD})
    assert resp.status_code == 422


async def test_login_missing_password_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/login", json={"mobile": unique_mobile()})
    assert resp.status_code == 422


async def test_login_empty_password_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/login", json={"mobile": unique_mobile(), "password": ""})
    assert resp.status_code == 422


async def test_login_real_estate_user_can_login(client: AsyncClient) -> None:
    """Regression: real_estate line user must be created and able to log in."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 200


async def test_login_fails_closed_when_active_user_has_no_active_access_profile(
    client: AsyncClient,
) -> None:
    """An orphaned identity must never be issued an implicit Client session."""
    import app.db.session as _session_mod
    from app.models.profile import ClientProfile, ProfileStatus
    from app.models.user import User

    _, mobile = await full_registration(client)
    async with _session_mod.AsyncSessionLocal() as session:
        user = await session.scalar(select(User).where(User.mobile == mobile))
        profiles = list(
            (
                await session.scalars(
                    select(ClientProfile).where(ClientProfile.auth_user_uuid == user.id)
                )
            ).all()
        )
        for profile in profiles:
            profile.status = ProfileStatus.INACTIVE
        await session.commit()

    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Account is not active."


async def test_login_response_includes_verification_flags(client: AsyncClient) -> None:
    """Login carries phone_verified/email_verified so the frontend can show the banner."""
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    body = resp.json()
    assert body["phone_verified"] is True
    assert body["email_verified"] is False


async def test_login_unknown_mobile_is_not_captured_as_lead(client: AsyncClient) -> None:
    """Authentication attempts without service intent do not become sales leads."""
    mobile = unique_mobile()
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert await _lead_exists(mobile) is False


async def test_registration_capture_failure_does_not_break_login(
    client: AsyncClient, monkeypatch
) -> None:
    """A best-effort registration lead failure does not break later authentication."""

    def _boom():
        raise RuntimeError("db down")

    # capture_lead opens its own AsyncSessionLocal(); make that raise.
    monkeypatch.setattr("app.services.leads.AsyncSessionLocal", _boom)
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 200
