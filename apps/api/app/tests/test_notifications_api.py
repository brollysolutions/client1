"""/api/v1/notifications — HTTP-layer behavior for the client role.

RLS isolation is covered in test_notifications_rls.py; this file covers the
endpoint contract: auth required, empty-list shape, unread-count, mark-read,
read-all, and the real producers (site-visit create/cancel, ticket create)
each emit exactly one notification to the owner.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration

_TOMORROW = (date.today() + timedelta(days=1)).isoformat()


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/notifications")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unread_count_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/notifications/unread-count")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_empty_for_new_client(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get("/api/v1/notifications", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"notifications": []}

    count = await client.get(
        "/api/v1/notifications/unread-count", headers={"Authorization": f"Bearer {token}"}
    )
    assert count.json() == {"count": 0}


@pytest.mark.asyncio
async def test_site_visit_create_emits_one_notification(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/site-visits",
        headers=headers,
        json={
            "property_ref": "prop-42",
            "title": "3BHK Villa",
            "locality": "Whitefield",
            "city": "Bengaluru",
            "contact_name": "Asha Rao",
            "contact_mobile": "+919876543210",
            "preferred_date": _TOMORROW,
            "preferred_time_slot": "morning",
        },
    )

    listed = await client.get("/api/v1/notifications", headers=headers)
    notifications = listed.json()["notifications"]
    assert len(notifications) == 1
    assert notifications[0]["type"] == "site_visit_requested"
    assert notifications[0]["read_at"] is None

    count = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert count.json() == {"count": 1}


@pytest.mark.asyncio
async def test_site_visit_cancel_emits_notification(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post(
        "/api/v1/site-visits",
        headers=headers,
        json={
            "property_ref": "prop-42",
            "title": "3BHK Villa",
            "locality": "Whitefield",
            "city": "Bengaluru",
            "contact_name": "Asha Rao",
            "contact_mobile": "+919876543210",
            "preferred_date": _TOMORROW,
            "preferred_time_slot": "morning",
        },
    )
    visit_id = created.json()["id"]
    await client.patch(f"/api/v1/site-visits/{visit_id}/cancel", headers=headers)

    listed = await client.get("/api/v1/notifications", headers=headers)
    types = {n["type"] for n in listed.json()["notifications"]}
    assert types == {"site_visit_requested", "site_visit_cancelled"}


@pytest.mark.asyncio
async def test_support_ticket_create_emits_notification(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/support-tickets/tickets",
        headers=headers,
        json={"category": "general", "subject": "Help", "body": "I need help with my account."},
    )

    listed = await client.get("/api/v1/notifications", headers=headers)
    notifications = listed.json()["notifications"]
    assert len(notifications) == 1
    assert notifications[0]["type"] == "support_ticket_received"


@pytest.mark.asyncio
async def test_mark_read(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    await client.post(
        "/api/v1/support-tickets/tickets",
        headers=headers,
        json={"category": "general", "subject": "Help", "body": "I need help."},
    )
    notification_id = (await client.get("/api/v1/notifications", headers=headers)).json()[
        "notifications"
    ][0]["id"]

    resp = await client.patch(f"/api/v1/notifications/{notification_id}/read", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["read_at"] is not None

    count = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert count.json() == {"count": 0}


@pytest.mark.asyncio
async def test_mark_read_is_idempotent(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    await client.post(
        "/api/v1/support-tickets/tickets",
        headers=headers,
        json={"category": "general", "subject": "Help", "body": "I need help."},
    )
    notification_id = (await client.get("/api/v1/notifications", headers=headers)).json()[
        "notifications"
    ][0]["id"]

    first = await client.patch(f"/api/v1/notifications/{notification_id}/read", headers=headers)
    second = await client.patch(f"/api/v1/notifications/{notification_id}/read", headers=headers)
    assert first.json()["read_at"] == second.json()["read_at"]


@pytest.mark.asyncio
async def test_mark_read_unknown_id_is_404(client: AsyncClient) -> None:
    import uuid

    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.patch(
        f"/api/v1/notifications/{uuid.uuid4()}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_mark_all_read(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(2):
        await client.post(
            "/api/v1/support-tickets/tickets",
            headers=headers,
            json={"category": "general", "subject": "Help", "body": "I need help."},
        )

    count_before = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert count_before.json() == {"count": 2}

    resp = await client.post("/api/v1/notifications/read-all", headers=headers)
    assert resp.status_code == 204

    count_after = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert count_after.json() == {"count": 0}


@pytest.mark.asyncio
async def test_other_client_cannot_see_or_mark_notification(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["real_estate"])
    await client.post(
        "/api/v1/support-tickets/tickets",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"category": "general", "subject": "Help", "body": "I need help."},
    )
    notification_id = (
        await client.get(
            "/api/v1/notifications", headers={"Authorization": f"Bearer {owner_token}"}
        )
    ).json()["notifications"][0]["id"]

    other_token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get(
        "/api/v1/notifications", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert resp.json() == {"notifications": []}

    mark = await client.patch(
        f"/api/v1/notifications/{notification_id}/read",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert mark.status_code == 404


@pytest.mark.asyncio
async def test_platform_admin_list_and_count_are_own_only(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: notifications.py now filters every query by user_uuid, not
    just RLS — an admin's own feed excludes another user's notification even
    though the admin's platform_scope bypass can still reach the row via RLS."""
    owner_token, owner_mobile = await full_registration(client, lines=["real_estate"])
    await client.post(
        "/api/v1/support-tickets/tickets",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"category": "general", "subject": "Help", "body": "I need help."},
    )

    _, admin_mobile = await full_registration(client, lines=["real_estate"])
    admin_uid = await _auth_user_uuid(admin_mobile)
    admin_headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    listed = await client.get("/api/v1/notifications", headers=admin_headers)
    assert listed.json() == {"notifications": []}

    count = await client.get("/api/v1/notifications/unread-count", headers=admin_headers)
    assert count.json() == {"count": 0}


@pytest.mark.asyncio
async def test_platform_admin_read_all_does_not_touch_other_users(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: POST /read-all is owner-scoped for every role, admin
    included — the reported bug was a platform-scoped caller mass-marking
    every user's notifications read in one request."""
    owner_token, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    await client.post(
        "/api/v1/support-tickets/tickets",
        headers=owner_headers,
        json={"category": "general", "subject": "Help", "body": "I need help."},
    )
    owner_count_before = await client.get(
        "/api/v1/notifications/unread-count", headers=owner_headers
    )
    assert owner_count_before.json() == {"count": 1}

    _, admin_mobile = await full_registration(client, lines=["real_estate"])
    admin_uid = await _auth_user_uuid(admin_mobile)
    admin_headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    resp = await client.post("/api/v1/notifications/read-all", headers=admin_headers)
    assert resp.status_code == 204

    owner_count_after = await client.get(
        "/api/v1/notifications/unread-count", headers=owner_headers
    )
    assert owner_count_after.json() == {"count": 1}, "admin's read-all touched another user's row"
