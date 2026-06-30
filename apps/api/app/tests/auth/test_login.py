"""Login integration tests.

Covers POST /auth/login.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from app.core.config import settings
from conftest import PASSWORD, full_registration, unique_mobile


async def test_login_valid_credentials_returns_200(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 200


async def test_login_response_has_access_token(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.json()["access_token"]


async def test_login_token_type_is_bearer(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.json()["token_type"] == "bearer"


async def test_login_expires_in_matches_config(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.json()["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


async def test_login_refresh_cookie_set(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    set_cookie = resp.headers.get("set-cookie", "")
    assert "refresh_token" in set_cookie


async def test_login_wrong_password_returns_401(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": "Wrong@9999"})
    assert resp.status_code == 401


async def test_login_error_message_is_generic(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": "Wrong@9999"})
    assert "invalid" in resp.json()["detail"].lower()


async def test_login_unknown_mobile_returns_401(client: AsyncClient) -> None:
    resp = await client.post("/auth/login", json={"mobile": unique_mobile(), "password": PASSWORD})
    assert resp.status_code == 401


async def test_login_unknown_and_wrong_pw_same_message(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    wrong_pw = await client.post("/auth/login", json={"mobile": mobile, "password": "Wrong@9"})
    unknown = await client.post(
        "/auth/login", json={"mobile": unique_mobile(), "password": PASSWORD}
    )
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


async def test_login_lockout_after_5_failures_returns_429(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    for _ in range(5):
        await client.post("/auth/login", json={"mobile": mobile, "password": "Wrong@9"})
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 429


async def test_login_correct_on_4th_failure_succeeds(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    for _ in range(4):
        await client.post("/auth/login", json={"mobile": mobile, "password": "Wrong@9"})
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 200


async def test_login_invalid_mobile_format_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/auth/login", json={"mobile": "9876543210", "password": PASSWORD})
    assert resp.status_code == 422


async def test_login_missing_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/auth/login", json={"password": PASSWORD})
    assert resp.status_code == 422


async def test_login_missing_password_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/auth/login", json={"mobile": unique_mobile()})
    assert resp.status_code == 422


async def test_login_empty_password_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/auth/login", json={"mobile": unique_mobile(), "password": ""})
    assert resp.status_code == 422


async def test_login_real_estate_user_can_login(client: AsyncClient) -> None:
    """Regression: real_estate line user must be created and able to log in."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    resp = await client.post("/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 200
