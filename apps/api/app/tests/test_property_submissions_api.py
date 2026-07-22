"""property-submissions API — submit, queue, approve, reject, guards.

Mints role-specific access tokens (agent / admin) for an already-registered
auth_user: get_current_user reads the mobile from the row but takes role +
business_line + platform_scope from the JWT claims, so a client account can act
as an agent/admin for the endpoint under test.
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


def _agent_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "agent", "business_line": "real_estate", "platform_scope": "false"}
    )


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "real_estate", "platform_scope": "true"}
    )


_PAYLOAD = {
    "title": "2BHK Apartment",
    "type": "Apartment",
    "location": "Koramangala, Bengaluru",
    "category": "apartments",
    "city": "Bengaluru",
    "locality": "Koramangala",
    "pincode": "560095",
    "price_paise": 78_00_00_000,
    "furnishing": "furnished",
    "construction_status": "ready",
    "rera_number": "RERA/RE/2026/00099",
}


@pytest.mark.asyncio
async def test_agent_submit_creates_pending(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/property-submissions",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["submitter_uuid"] == uid
    assert body["approved_property_id"] is None


@pytest.mark.asyncio
async def test_client_cannot_submit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "real_estate", "platform_scope": "false"}
    )
    res = await client.post(
        "/api/v1/property-submissions",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_submit_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    bad = {**_PAYLOAD, "price_paise": 0}  # gt=0 fails
    res = await client.post(
        "/api/v1/property-submissions",
        json=bad,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reviewer_approve_creates_property(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]

    res = await client.post(
        f"/api/v1/property-submissions/{sub_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "approved"
    assert body["approved_property_id"] is not None

    # The new listing is now in the catalog.
    prop = await client.get(
        f"/api/v1/properties/{body['approved_property_id']}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert prop.status_code == 200
    assert prop.json()["price_display"] == "₹78 L"


@pytest.mark.asyncio
async def test_double_approve_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}
    await client.post(f"/api/v1/property-submissions/{sub_id}/approve", headers=headers)
    second = await client.post(f"/api/v1/property-submissions/{sub_id}/approve", headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_reject_sets_note(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]
    res = await client.post(
        f"/api/v1/property-submissions/{sub_id}/reject",
        json={"note": "RERA number could not be verified."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    assert res.json()["review_note"] == "RERA number could not be verified."


@pytest.mark.asyncio
async def test_agent_cannot_approve(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]
    res = await client.post(
        f"/api/v1/property-submissions/{sub_id}/approve",
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_approve_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/property-submissions/00000000-0000-0000-0000-000000000000/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404
