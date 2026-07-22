"""/api/v1/bookmarks — HTTP-layer behavior for the client role.

RLS isolation is covered in test_bookmarks_rls.py; this file covers the
endpoint contract: auth required, empty-list shape, create/list round trip,
idempotent re-bookmark, delete, and another client's bookmarks stay invisible.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from conftest import full_registration


def _payload(**overrides: object) -> dict:
    body = {
        "property_ref": "prop-42",
        "title": "3BHK Villa",
        "locality": "Whitefield",
        "city": "Bengaluru",
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/bookmarks")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/bookmarks", json=_payload())
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_empty_for_new_client(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get("/api/v1/bookmarks", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"bookmarks": []}


@pytest.mark.asyncio
async def test_create_then_list_own_bookmark(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post("/api/v1/bookmarks", headers=headers, json=_payload())
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["property_ref"] == "prop-42"
    assert body["title"] == "3BHK Villa"

    listed = await client.get("/api/v1/bookmarks", headers=headers)
    assert listed.status_code == 200
    bookmarks = listed.json()["bookmarks"]
    assert [b["id"] for b in bookmarks] == [body["id"]]


@pytest.mark.asyncio
async def test_bookmark_twice_is_idempotent(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}

    first = await client.post("/api/v1/bookmarks", headers=headers, json=_payload())
    assert first.status_code == 200
    second = await client.post("/api/v1/bookmarks", headers=headers, json=_payload())
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]

    listed = await client.get("/api/v1/bookmarks", headers=headers)
    assert len(listed.json()["bookmarks"]) == 1


@pytest.mark.asyncio
async def test_delete_removes_bookmark(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/bookmarks", headers=headers, json=_payload())

    resp = await client.delete("/api/v1/bookmarks/prop-42", headers=headers)
    assert resp.status_code == 204

    listed = await client.get("/api/v1/bookmarks", headers=headers)
    assert listed.json() == {"bookmarks": []}


@pytest.mark.asyncio
async def test_delete_unknown_is_safe(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.delete(
        "/api/v1/bookmarks/does-not-exist", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_other_client_cannot_see_bookmark(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["real_estate"])
    await client.post(
        "/api/v1/bookmarks",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=_payload(),
    )

    other_token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get("/api/v1/bookmarks", headers={"Authorization": f"Bearer {other_token}"})
    assert resp.status_code == 200
    assert resp.json() == {"bookmarks": []}
