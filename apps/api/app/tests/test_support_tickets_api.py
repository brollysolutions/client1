"""/api/v1/support-tickets — HTTP-layer behavior for the client role.

RLS isolation is covered in test_support_tickets_rls.py; this file covers the
endpoint contract: auth required, empty-list shape, create round-trip, another
client's tickets stay invisible, and validation failure.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from conftest import full_registration


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/support-tickets/tickets")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/support-tickets/tickets",
        json={"category": "general", "subject": "Hi", "body": "Body"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_empty_for_new_client(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        "/api/v1/support-tickets/tickets", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"tickets": []}


@pytest.mark.asyncio
async def test_create_then_list_own_ticket(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post(
        "/api/v1/support-tickets/tickets",
        headers=headers,
        json={"category": "otp", "subject": "No OTP call", "body": "Never got the call."},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["category"] == "otp"
    assert body["status"] == "open"
    assert body["subject"] == "No OTP call"

    listed = await client.get("/api/v1/support-tickets/tickets", headers=headers)
    assert listed.status_code == 200
    tickets = listed.json()["tickets"]
    assert [t["id"] for t in tickets] == [body["id"]]


@pytest.mark.asyncio
async def test_other_client_cannot_see_ticket(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["loans"])
    await client.post(
        "/api/v1/support-tickets/tickets",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"category": "general", "subject": "Owner ticket", "body": "Private."},
    )

    other_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        "/api/v1/support-tickets/tickets",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"tickets": []}


@pytest.mark.asyncio
async def test_blank_subject_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.post(
        "/api/v1/support-tickets/tickets",
        headers={"Authorization": f"Bearer {token}"},
        json={"category": "general", "subject": "   ", "body": "Body"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_category_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.post(
        "/api/v1/support-tickets/tickets",
        headers={"Authorization": f"Bearer {token}"},
        json={"category": "not_a_category", "subject": "Hi", "body": "Body"},
    )
    assert resp.status_code == 422
