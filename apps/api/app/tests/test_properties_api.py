"""/api/v1/properties — HTTP-layer behavior for the read-only listing catalog.

RLS visibility is covered in test_properties_rls.py; this file covers the
endpoint contract: auth required, list returns active listings and hides
inactive ones, detail returns the full typed row, a missing id is 404, and an
inactive row reads as 404 (never 403) for a non-admin.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration


async def _seed_property(*, active: bool, title: str) -> str:
    """Insert a property via the app superuser (bypasses RLS). Returns its id."""
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        prop = Property(
            business_line="real_estate",
            active=active,
            title=title,
            type="Apartment",
            location="API Locality, API City",
            price_display="₹80 L",
            meta="2 bed · 1,100 sqft",
            image="/illustrations/properties/apartment-1.svg",
            category="apartments",
            city="API City",
            locality="API Locality",
            pincode="560001",
            price_paise=8_000_000_0,
            bhk=2,
            area_sqft=1100,
            furnishing="furnished",
            construction_status="ready",
            amenities=["lift", "gym"],
            age_years=3,
            rera_number="RERA/KA/2024/1234",
            details={},
        )
        db.add(prop)
        await db.commit()
        return str(prop.id)


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        value = await db.scalar(
            text("SELECT id FROM auth_users WHERE mobile = :mobile"), {"mobile": mobile}
        )
        assert value is not None
        return str(value)


def _admin_token(user_uuid: str, *, platform_scope: str = "true") -> str:
    return create_access_token(
        {
            "sub": user_uuid,
            "role": "admin",
            "business_line": "",
            "platform_scope": platform_scope,
        }
    )


async def _listing_audit(property_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            (
                await db.execute(
                    text(
                        "SELECT actor_uuid, actor_role, action, entity_type, detail "
                        "FROM audit_log WHERE entity_uuid = :property_id "
                        "ORDER BY created_at DESC LIMIT 1"
                    ),
                    {"property_id": property_id},
                )
            )
            .mappings()
            .one()
        )
        return dict(row)


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/properties")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_requires_auth(client: AsyncClient) -> None:
    resp = await client.get(f"/api/v1/properties/{uuid.uuid4()}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_returns_active_hides_inactive(client: AsyncClient) -> None:
    active_id = await _seed_property(active=True, title="API Active Listing")
    inactive_id = await _seed_property(active=False, title="API Inactive Listing")

    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get("/api/v1/properties", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()["properties"]}
    assert active_id in ids
    assert inactive_id not in ids


@pytest.mark.asyncio
async def test_get_by_id_returns_typed_row(client: AsyncClient) -> None:
    pid = await _seed_property(active=True, title="API Detail Listing")
    token, _ = await full_registration(client, lines=["real_estate"])

    resp = await client.get(
        f"/api/v1/properties/{pid}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == pid
    assert body["price_paise"] == 8_000_000_0
    assert body["category"] == "apartments"
    assert body["construction_status"] == "ready"
    assert body["amenities"] == ["lift", "gym"]
    assert body["rera_number"] == "RERA/KA/2024/1234"


@pytest.mark.asyncio
async def test_get_missing_is_404(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get(
        f"/api/v1/properties/{uuid.uuid4()}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_inactive_is_404_for_client(client: AsyncClient) -> None:
    """An inactive row is RLS-filtered for a client, so detail reads as 404, not 403."""
    pid = await _seed_property(active=False, title="API Hidden Listing")
    token, _ = await full_registration(client, lines=["real_estate"])

    resp = await client.get(
        f"/api/v1/properties/{pid}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_platform_admin_lists_and_publishes_inactive_listing_with_safe_audit(
    client: AsyncClient,
) -> None:
    property_id = await _seed_property(active=False, title="Admin Publish Listing")
    _, admin_mobile = await full_registration(client, lines=["real_estate"])
    admin_uuid = await _auth_user_uuid(admin_mobile)
    headers = {"Authorization": f"Bearer {_admin_token(admin_uuid)}"}

    listed = await client.get("/api/v1/properties", headers=headers)
    assert listed.status_code == 200, listed.text
    assert property_id in {row["id"] for row in listed.json()["properties"]}

    updated = await client.patch(
        f"/api/v1/properties/{property_id}/status",
        headers=headers,
        json={"active": True, "reason": "Approved inventory release"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["active"] is True

    audit = await _listing_audit(property_id)
    assert str(audit["actor_uuid"]) == admin_uuid
    assert audit["actor_role"] == "admin"
    assert audit["action"] == "property_listing_updated"
    assert audit["entity_type"] == "property"
    assert audit["detail"] == {
        "previous_active": False,
        "active": True,
        "reason": "Approved inventory release",
    }


@pytest.mark.asyncio
async def test_listing_status_rejects_client_and_line_scoped_admin(client: AsyncClient) -> None:
    property_id = await _seed_property(active=False, title="Protected Listing")
    client_token, client_mobile = await full_registration(client, lines=["real_estate"])
    user_uuid = await _auth_user_uuid(client_mobile)

    for token in (client_token, _admin_token(user_uuid, platform_scope="false")):
        response = await client.patch(
            f"/api/v1/properties/{property_id}/status",
            headers={"Authorization": f"Bearer {token}"},
            json={"active": True, "reason": "Unauthorized change"},
        )
        assert response.status_code == 403
