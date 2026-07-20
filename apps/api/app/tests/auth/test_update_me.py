"""PATCH /api/v1/auth/me — client edits their own profile.

Covers success (name + GET reflects it), auth failure, validation, the email
change resetting verification, and the email-collision path.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from conftest import full_registration, unique_email


@pytest.mark.asyncio
async def test_update_requires_auth(client: AsyncClient) -> None:
    resp = await client.patch("/api/v1/auth/me", json={"first_name": "New", "last_name": "Name"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_update_name_reflected_in_me(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"first_name": "Aarav", "last_name": "Sharma"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["first_name"] == "Aarav"
    assert resp.json()["last_name"] == "Sharma"

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["first_name"] == "Aarav"
    assert me.json()["last_name"] == "Sharma"


@pytest.mark.asyncio
async def test_blank_name_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"first_name": "   ", "last_name": "Sharma"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_email_change_updates_and_stays_unverified(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    new_email = unique_email()

    resp = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"first_name": "Aarav", "last_name": "Sharma", "email": new_email},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == new_email
    assert body["email_verified"] is False


@pytest.mark.asyncio
async def test_email_collision_is_400(client: AsyncClient) -> None:
    taken_email = unique_email()
    await full_registration(client, lines=["loans"], email=taken_email)

    other_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"first_name": "Bob", "last_name": "Kumar", "email": taken_email},
    )
    assert resp.status_code == 400
