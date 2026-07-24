"""offers API — create, schedule/activate/archive, guards.

Mints role-specific access tokens (sub_admin / admin) for an already-registered
auth_user: get_current_user reads the mobile from the row but takes role +
business_line + platform_scope from the JWT claims, so a client account can act
as a sub_admin/admin for the endpoint under test. Mirrors test_banners_api.py,
minus the approve/reject branch — offers has no Admin-approval gate.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "both", "platform_scope": "true"}
    )


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "both", "platform_scope": "true"}
    )


_PAYLOAD = {
    "business_line": "loans",
    "title": "Diwali Cashback Offer",
    "discount_type": "percentage",
    "discount_value": "10",
}


@pytest.mark.asyncio
async def test_sub_admin_create_starts_draft(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "draft"
    assert body["created_by_uuid"] == uid


@pytest.mark.asyncio
async def test_client_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_create_percentage_over_100_is_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    bad = {**_PAYLOAD, "discount_value": "150"}
    res = await client.post(
        "/api/v1/offers",
        json=bad,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_negative_discount_is_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    bad = {**_PAYLOAD, "discount_value": "-5"}
    res = await client.post(
        "/api/v1/offers",
        json=bad,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_schedule_then_activate_then_archive(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    scheduled = await client.post(f"/api/v1/offers/{offer_id}/schedule", headers=headers)
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["status"] == "scheduled"

    activated = await client.post(f"/api/v1/offers/{offer_id}/activate", headers=headers)
    assert activated.status_code == 200, activated.text
    assert activated.json()["status"] == "active"

    archived = await client.post(f"/api/v1/offers/{offer_id}/archive", headers=headers)
    assert archived.status_code == 200, archived.text
    assert archived.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_activate_from_draft_is_illegal_transition(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    res = await client.post(f"/api/v1/offers/{offer_id}/activate", headers=headers)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_edit_while_active_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]
    await client.post(f"/api/v1/offers/{offer_id}/schedule", headers=headers)
    await client.post(f"/api/v1/offers/{offer_id}/activate", headers=headers)

    res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"title": "Edited while active"},
        headers=headers,
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_edit_while_draft_succeeds(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"title": "Edited while draft"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Edited while draft"


@pytest.mark.asyncio
async def test_partial_patch_cannot_bypass_percentage_cap(client: AsyncClient) -> None:
    """OfferUpdate's validator only sees fields in the request, so a bare
    discount_value patch can't check itself against the existing (unsent)
    discount_type — the route re-validates the merged row instead."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"discount_value": "500"},
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_schedule_then_archive_directly_without_activating(client: AsyncClient) -> None:
    """scheduled -> archived is a legal cancel-in-place edge, skipping active."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    scheduled = await client.post(f"/api/v1/offers/{offer_id}/schedule", headers=headers)
    assert scheduled.status_code == 200, scheduled.text

    archived = await client.post(f"/api/v1/offers/{offer_id}/archive", headers=headers)
    assert archived.status_code == 200, archived.text
    assert archived.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_admin_has_no_create_endpoint_access(client: AsyncClient) -> None:
    """Admin gets read-only oversight — no create/action write path exists."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_schedule_a_sub_admins_offer(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    offer_id = created.json()["id"]
    res = await client.post(
        f"/api/v1/offers/{offer_id}/schedule",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_schedule_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/offers/00000000-0000-0000-0000-000000000000/schedule",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_other_sub_admin_cannot_edit_or_advance(client: AsyncClient) -> None:
    """Shared visibility (any sub_admin sees every offer) is not shared write
    access — edit/advance stays owner-scoped."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    created = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"},
    )
    offer_id = created.json()["id"]

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)
    other_headers = {"Authorization": f"Bearer {_sub_admin_token(other_uid)}"}

    edit_res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"title": "Hijacked"},
        headers=other_headers,
    )
    assert edit_res.status_code == 403

    schedule_res = await client.post(f"/api/v1/offers/{offer_id}/schedule", headers=other_headers)
    assert schedule_res.status_code == 403


@pytest.mark.asyncio
async def test_non_sub_admin_non_admin_sees_empty_list(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    token = create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(
        "/api/v1/offers",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["offers"] == []
