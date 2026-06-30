"""Change-password endpoint integration tests.

Covers POST /auth/change-password.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from conftest import PASSWORD, full_registration


async def test_change_password_valid_returns_200(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "Changed@9876",
            "confirm_password": "Changed@9876",
        },
    )
    assert resp.status_code == 200


async def test_change_password_new_password_works_on_login(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    login = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    access_token = login.json()["access_token"]
    new_pw = "Changed@9876"
    await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": PASSWORD, "new_password": new_pw, "confirm_password": new_pw},
    )
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": new_pw})
    assert resp.status_code == 200


async def test_change_password_old_password_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    login = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    access_token = login.json()["access_token"]
    new_pw = "Changed@9876"
    await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": PASSWORD, "new_password": new_pw, "confirm_password": new_pw},
    )
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 401


async def test_change_password_wrong_current_returns_401(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "WrongOld@1",
            "new_password": "Changed@9876",
            "confirm_password": "Changed@9876",
        },
    )
    assert resp.status_code == 401


async def test_change_password_mismatch_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "Changed@9876",
            "confirm_password": "Different@9876",
        },
    )
    assert resp.status_code == 422


async def test_change_password_too_short_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "Ab1234!",
            "confirm_password": "Ab1234!",
        },
    )
    assert resp.status_code == 422


async def test_change_password_too_long_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    pw = "A1" + "x" * 127
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": PASSWORD, "new_password": pw, "confirm_password": pw},
    )
    assert resp.status_code == 422


async def test_change_password_no_letters_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "12345678",
            "confirm_password": "12345678",
        },
    )
    assert resp.status_code == 422


async def test_change_password_no_digits_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "NoDigitsHere!",
            "confirm_password": "NoDigitsHere!",
        },
    )
    assert resp.status_code == 422


async def test_change_password_common_password_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "Password1",
            "confirm_password": "Password1",
        },
    )
    assert resp.status_code == 422


async def test_change_password_no_auth_header_returns_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": PASSWORD,
            "new_password": "New@Pass1",
            "confirm_password": "New@Pass1",
        },
    )
    assert resp.status_code == 401


async def test_change_password_invalid_token_returns_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": "Bearer garbage.token.value"},
        json={
            "current_password": PASSWORD,
            "new_password": "New@Pass1",
            "confirm_password": "New@Pass1",
        },
    )
    assert resp.status_code == 401


async def test_change_password_missing_current_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"new_password": "New@Pass1", "confirm_password": "New@Pass1"},
    )
    assert resp.status_code == 422


async def test_change_password_missing_new_password_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": PASSWORD, "confirm_password": "New@Pass1"},
    )
    assert resp.status_code == 422
