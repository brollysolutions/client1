"""/api/v1/enquiries — HTTP-layer behavior for the client role.

RLS isolation is covered in test_enquiries_rls.py; this file covers the
endpoint contract: auth required, empty-list shape, create/list round trip,
another client's enquiries stay invisible, and validation failures.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import delete

from conftest import full_registration

_PROPERTY_ID = ""


@pytest.fixture(autouse=True)
async def _active_property() -> None:
    import app.db.session as _session_mod
    from app.models.property import Property

    global _PROPERTY_ID
    async with _session_mod.AsyncSessionLocal() as db:
        property_listing = Property(
            business_line="real_estate",
            active=True,
            title="Canonical 3BHK Villa",
            type="Villa",
            location="Verified Locality, Verified City",
            price_display="₹1.2 Cr",
            category="villas",
            city="Verified City",
            locality="Verified Locality",
            pincode="560001",
            price_paise=1_200_000_000,
            bhk=3,
            area_sqft=1800,
            amenities=[],
            age_years=0,
            rera_applicability="unsure",
            rera_verification_status="not_reviewed",
            details={},
        )
        db.add(property_listing)
        await db.commit()
        _PROPERTY_ID = str(property_listing.id)
    try:
        yield
    finally:
        async with _session_mod.AsyncSessionLocal() as db:
            await db.execute(delete(Property).where(Property.id == uuid.UUID(_PROPERTY_ID)))
            await db.commit()


def _payload(**overrides: object) -> dict:
    body = {
        "property_ref": _PROPERTY_ID,
        "title": "3BHK Villa",
        "locality": "Whitefield",
        "city": "Bengaluru",
        "contact_name": "Asha Rao",
        "contact_mobile": "+919876543210",
        "message": "Please call ahead.",
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/enquiries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/enquiries", json=_payload())
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_empty_for_new_client(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get("/api/v1/enquiries", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"enquiries": []}


@pytest.mark.asyncio
async def test_create_then_list_own_enquiry(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post("/api/v1/enquiries", headers=headers, json=_payload())
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "new"
    assert body["property_ref"] == _PROPERTY_ID
    assert body["title"] == "Canonical 3BHK Villa"
    assert body["locality"] == "Verified Locality"
    assert body["city"] == "Verified City"

    listed = await client.get("/api/v1/enquiries", headers=headers)
    assert listed.status_code == 200
    enquiries = listed.json()["enquiries"]
    assert [e["id"] for e in enquiries] == [body["id"]]


@pytest.mark.asyncio
async def test_other_client_cannot_see_enquiry(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["real_estate"])
    await client.post(
        "/api/v1/enquiries",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=_payload(),
    )

    other_token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get("/api/v1/enquiries", headers={"Authorization": f"Bearer {other_token}"})
    assert resp.status_code == 200
    assert resp.json() == {"enquiries": []}


@pytest.mark.asyncio
async def test_blank_contact_name_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/enquiries",
        headers={"Authorization": f"Bearer {token}"},
        json=_payload(contact_name="   "),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_mobile_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/enquiries",
        headers={"Authorization": f"Bearer {token}"},
        json=_payload(contact_mobile="9876543210"),  # missing +country code
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unknown_property_is_404(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/enquiries",
        headers={"Authorization": f"Bearer {token}"},
        json=_payload(property_ref=str(uuid.uuid4())),
    )
    assert resp.status_code == 404


def _staff_token(user_id: str, role: str) -> str:
    """Same account, staff-role claims: RLS would let this role see the line's
    enquiries, but raising one must stay client-only at the app layer (see
    _require_client in api/v1/enquiries.py)."""
    from app.core.security import create_access_token

    return create_access_token(
        {"sub": user_id, "role": role, "business_line": "real_estate", "platform_scope": "line"}
    )


@pytest.mark.asyncio
async def test_staff_cannot_create_enquiry(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])

    from sqlalchemy import text as _text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(_text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
    staff_token = _staff_token(str(row[0]), "telecaller")

    resp = await client.post(
        "/api/v1/enquiries",
        headers={"Authorization": f"Bearer {staff_token}"},
        json=_payload(),
    )
    assert resp.status_code == 403
