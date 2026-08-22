"""/api/v1/site-visits — HTTP-layer behavior for the client role.

RLS isolation is covered in test_site_visits_rls.py; this file covers the
endpoint contract: auth required, empty-list shape, create/list round trip,
another client's visits stay invisible, validation failures, and cancel
(success, already-cancelled, done, and non-owner-invisible-as-404).

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete

from conftest import full_registration

_TOMORROW = (date.today() + timedelta(days=1)).isoformat()
_YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
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
        "preferred_date": _TOMORROW,
        "preferred_time_slot": "morning",
        "message": "Please call ahead.",
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/site-visits")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/site-visits", json=_payload())
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cancel_requires_auth(client: AsyncClient) -> None:
    resp = await client.patch(f"/api/v1/site-visits/{uuid.uuid4()}/cancel")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_empty_for_new_client(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get("/api/v1/site-visits", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"visits": []}


@pytest.mark.asyncio
async def test_create_then_list_own_visit(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post("/api/v1/site-visits", headers=headers, json=_payload())
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "requested"
    assert body["property_ref"] == _PROPERTY_ID
    assert body["title"] == "Canonical 3BHK Villa"
    assert body["locality"] == "Verified Locality"
    assert body["city"] == "Verified City"
    assert body["preferred_time_slot"] == "morning"
    assert body["cancelled_at"] is None

    listed = await client.get("/api/v1/site-visits", headers=headers)
    assert listed.status_code == 200
    visits = listed.json()["visits"]
    assert [v["id"] for v in visits] == [body["id"]]


@pytest.mark.asyncio
async def test_other_client_cannot_see_visit(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["real_estate"])
    await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=_payload(),
    )

    other_token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.get(
        "/api/v1/site-visits", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"visits": []}


@pytest.mark.asyncio
async def test_blank_contact_name_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {token}"},
        json=_payload(contact_name="   "),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_mobile_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {token}"},
        json=_payload(contact_mobile="9876543210"),  # missing +country code
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_past_preferred_date_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {token}"},
        json=_payload(preferred_date=_YESTERDAY),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unknown_property_is_404(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {token}"},
        json=_payload(property_ref=str(uuid.uuid4())),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cancel_success(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/api/v1/site-visits", headers=headers, json=_payload())
    visit_id = created.json()["id"]

    resp = await client.patch(f"/api/v1/site-visits/{visit_id}/cancel", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "cancelled"
    assert body["cancelled_at"] is not None


@pytest.mark.asyncio
async def test_cancel_already_cancelled_is_409(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/api/v1/site-visits", headers=headers, json=_payload())
    visit_id = created.json()["id"]

    first = await client.patch(f"/api/v1/site-visits/{visit_id}/cancel", headers=headers)
    assert first.status_code == 200

    second = await client.patch(f"/api/v1/site-visits/{visit_id}/cancel", headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_cancel_on_done_is_409(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/api/v1/site-visits", headers=headers, json=_payload())
    visit_id = created.json()["id"]

    # Flip to "done" directly via the app superuser (no staff endpoint exists yet
    # to progress a visit's status — this pass only ships client create/list/cancel).
    import app.db.session as _session_mod
    from app.models.site_visit import SiteVisit, SiteVisitStatus

    async with _session_mod.AsyncSessionLocal() as db:
        visit = await db.get(SiteVisit, uuid.UUID(visit_id))
        visit.status = SiteVisitStatus.DONE
        await db.commit()

    resp = await client.patch(f"/api/v1/site-visits/{visit_id}/cancel", headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_non_owner_cancel_is_404(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["real_estate"])
    created = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=_payload(),
    )
    visit_id = created.json()["id"]

    other_token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.patch(
        f"/api/v1/site-visits/{visit_id}/cancel",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cancel_unknown_id_is_404(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.patch(
        f"/api/v1/site-visits/{uuid.uuid4()}/cancel",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


def _staff_token(user_id: str, role: str) -> str:
    """Same account, staff-role claims: RLS would let this role see/touch the
    line's visits, but booking/cancelling must stay client-only at the app
    layer (see _require_client in api/v1/site_visits.py)."""
    from app.core.security import create_access_token

    return create_access_token(
        {"sub": user_id, "role": role, "business_line": "real_estate", "platform_scope": "line"}
    )


@pytest.mark.asyncio
async def test_staff_cannot_create_site_visit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])

    from sqlalchemy import text as _text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(_text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
    staff_token = _staff_token(str(row[0]), "telecaller")

    resp = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {staff_token}"},
        json=_payload(),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_real_estate_staff_cannot_cancel_clients_visit(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["real_estate"])
    created = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {owner_token}"},
        json=_payload(),
    )
    visit_id = created.json()["id"]

    from sqlalchemy import text as _text

    import app.db.session as _session_mod

    # A different real-estate staff/agent account, not the owner: RLS's
    # staff-line branch would make the row visible+updatable, so this must be
    # blocked before the service layer, not by RLS alone.
    agent_token, agent_mobile = await full_registration(client, lines=["real_estate"])
    async with _session_mod.AsyncSessionLocal() as db:
        agent_row = (
            await db.execute(
                _text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": agent_mobile}
            )
        ).fetchone()
    staff_token = _staff_token(str(agent_row[0]), "agent")

    resp = await client.patch(
        f"/api/v1/site-visits/{visit_id}/cancel",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert resp.status_code == 403

    # The visit is untouched — still requested, not cancelled.
    still = await client.get(
        "/api/v1/site-visits", headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert still.json()["visits"][0]["status"] == "requested"
