"""PATCH /api/v1/auth/me — client edits their own profile.

Covers success (name + GET reflects it), auth failure, validation, the email
change resetting verification, and the email-collision path.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import asyncio

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


@pytest.mark.asyncio
async def test_concurrent_email_updates_allow_exactly_one_owner(client: AsyncClient) -> None:
    first_token, _ = await full_registration(client, lines=["loans"])
    second_token, _ = await full_registration(client, lines=["loans"])
    shared_email = unique_email()

    results = await asyncio.gather(
        client.patch(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {first_token}"},
            json={"first_name": "First", "last_name": "Owner", "email": shared_email},
        ),
        client.patch(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {second_token}"},
            json={"first_name": "Second", "last_name": "Owner", "email": shared_email},
        ),
    )

    assert sorted(response.status_code for response in results) == [200, 400]


@pytest.mark.asyncio
async def test_optional_profile_fields_can_be_saved_and_cleared(client: AsyncClient) -> None:
    token, _ = await full_registration(client)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "first_name": "Aarav",
        "last_name": "Sharma",
        "gender": "self_described",
        "gender_self_description": "Agender",
        "income_source": "business_income",
        "income_amount_minor": 12_500_000,
        "income_period": "annual",
        "occupation": "Textile business owner",
        "location": "Kondapur, Hyderabad",
    }

    saved = await client.patch("/api/v1/auth/me", headers=headers, json=payload)
    assert saved.status_code == 200, saved.text
    for key, value in payload.items():
        assert saved.json()[key] == value

    cleared = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "first_name": "Aarav",
            "last_name": "Sharma",
            "gender": None,
            "gender_self_description": None,
            "income_source": None,
            "income_amount_minor": None,
            "income_period": None,
            "occupation": None,
            "location": None,
        },
    )
    assert cleared.status_code == 200, cleared.text
    for key in (
        "gender",
        "gender_self_description",
        "income_source",
        "income_amount_minor",
        "income_period",
        "occupation",
        "location",
    ):
        assert cleared.json()[key] is None


@pytest.mark.asyncio
async def test_email_can_be_added_then_cleared(client: AsyncClient) -> None:
    token, _ = await full_registration(client)
    headers = {"Authorization": f"Bearer {token}"}
    email = unique_email()

    added = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"first_name": "Aarav", "last_name": "Sharma", "email": email},
    )
    assert added.status_code == 200
    assert added.json()["email"] == email

    cleared = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"first_name": "Aarav", "last_name": "Sharma", "email": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["email"] is None
    assert cleared.json()["email_verified"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "profile",
    [
        {"gender": "self_described", "gender_self_description": None},
        {"gender": "female", "gender_self_description": "unexpected"},
        {"gender_self_description": None},
        {"income_source": "salaried", "income_amount_minor": 100_000},
        {
            "income_source": "net_salary",
            "income_amount_minor": 100_000,
            "income_period": "monthly",
        },
        {"income_source": None, "income_amount_minor": 100_000, "income_period": None},
        {"occupation": "   "},
        {"location": "   "},
    ],
)
async def test_inconsistent_optional_profile_values_are_422(
    client: AsyncClient, profile: dict
) -> None:
    token, _ = await full_registration(client)
    resp = await client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"first_name": "Aarav", "last_name": "Sharma", **profile},
    )
    assert resp.status_code == 422
