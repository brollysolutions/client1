"""Refresh and logout integration tests.

Covers POST /auth/refresh and POST /auth/logout.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from conftest import PASSWORD, do_login, full_registration

# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


async def test_refresh_valid_cookie_returns_200(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    assert resp.json()["access_token"]


async def test_refresh_new_token_differs_from_original(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    login_resp = await client.post(
        "/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD}
    )
    original = login_resp.json()["access_token"]
    refresh_resp = await client.post("/api/v1/auth/refresh")
    assert refresh_resp.json()["access_token"] != original


async def test_refresh_issues_new_set_cookie(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    resp = await client.post("/api/v1/auth/refresh")
    assert "set-cookie" in {k.lower() for k in resp.headers}


async def test_refresh_response_shape(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    resp = await client.post("/api/v1/auth/refresh")
    body = resp.json()
    assert "access_token" in body and "token_type" in body and "expires_in" in body


async def test_refresh_no_cookie_returns_401(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_refresh_malformed_cookie_returns_401(client: AsyncClient) -> None:
    client.cookies.set("refresh_token", "garbage-not-a-real-token")
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_refresh_old_token_after_rotation_returns_401(client: AsyncClient) -> None:
    """After rotation the OLD refresh token must be rejected (chain revocation)."""
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    old_token = client.cookies.get("refresh_token")
    await client.post("/api/v1/auth/refresh")  # rotates — new cookie set
    client.cookies.set("refresh_token", old_token)  # replay the old one
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_refresh_token_reuse_attack_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    raw_cookie = client.cookies.get("refresh_token")
    await client.post("/api/v1/auth/refresh")
    client.cookies.set("refresh_token", raw_cookie)
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_refresh_reuse_revokes_entire_chain(client: AsyncClient) -> None:
    """Replaying a rotated token must kill the WHOLE chain, including the live
    token the attacker rotated to (audit finding S1)."""
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    old_token = client.cookies.get("refresh_token")
    await client.post("/api/v1/auth/refresh")  # rotate → live token now in jar
    live_token = client.cookies.get("refresh_token")

    client.cookies.set("refresh_token", old_token)  # replay the rotated-away token
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401

    # The live token must now be dead too — reuse revoked the entire chain.
    client.cookies.set("refresh_token", live_token)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


async def test_logout_valid_token_returns_200(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["message"]


async def test_logout_blacklists_token(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"})
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "New@Pass1",
            "confirm_password": "New@Pass1",
        },
    )
    assert resp.status_code == 401


async def test_logout_clears_refresh_cookie(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    access_token = await do_login(client, mobile)
    resp = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
    )
    set_cookie = resp.headers.get("set-cookie", "")
    assert "refresh_token" in set_cookie
    assert "max-age=0" in set_cookie.lower() or "expires=" in set_cookie.lower()


async def test_logout_makes_refresh_return_401(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    login_resp = await client.post(
        "/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD}
    )
    access_token = login_resp.json()["access_token"]
    await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"})
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_logout_no_auth_header_returns_401(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 401


async def test_logout_invalid_token_returns_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": "Bearer garbage.token.value"}
    )
    assert resp.status_code == 401


async def test_logout_already_blacklisted_token_returns_401(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"})
    resp = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert resp.status_code == 401


async def test_logout_without_refresh_cookie_still_succeeds(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    client.cookies.clear()
    resp = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert resp.status_code == 200


async def test_logout_revokes_refresh_even_without_cookie(client: AsyncClient) -> None:
    """The refresh cookie is scoped to /refresh and never reaches /logout, yet
    logout must still end the session server-side (audit finding S2)."""
    _, mobile = await full_registration(client)
    login = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    access_token = login.json()["access_token"]
    live_cookie = client.cookies.get("refresh_token")

    # Drop the cookie so logout provably cannot rely on it, then log out.
    client.cookies.clear()
    logout = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert logout.status_code == 200

    # The refresh token issued at login must now be revoked.
    client.cookies.set("refresh_token", live_cookie)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


# ---------------------------------------------------------------------------
# Password change / reset evicts existing sessions
# ---------------------------------------------------------------------------


async def test_change_password_revokes_existing_refresh(client: AsyncClient) -> None:
    """Rotating the password must drop other live sessions (audit finding S6)."""
    access_token, _ = await full_registration(client)
    live_cookie = client.cookies.get("refresh_token")

    changed = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "New@Pass1",
            "confirm_password": "New@Pass1",
        },
    )
    assert changed.status_code == 200

    client.cookies.set("refresh_token", live_cookie)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
