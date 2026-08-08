"""Property deal lifecycle — creation + status/deal-terms progression.

Mirrors the loan-application-progress test pattern (state machine, stage-gated
terms, reason-required side-branch, telecaller-assigned-only + admin-bypass
access). Creation is telecaller-only here (no loans-style client Apply), so
this file also covers create_deal_for_lead's resolve_realestate_client_profile
path (Open Question 1 from the design: an unclaimed lead cannot open a deal).

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.core.security import create_access_token
from conftest import do_login, full_registration, unique_mobile


async def _seed_telecaller(business_line: str = "real_estate") -> tuple[str, str]:
    """Create an auth_user + telecaller StaffProfile. Returns (auth_user_uuid, staff_uuid)."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _seed_unclaimed_lead(business_line: str, staff_profile_uuid: str) -> str:
    """An assigned lead with no registered client behind its mobile."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(staff_profile_uuid),
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_registered_lead(
    client: AsyncClient, staff_profile_uuid: str | None
) -> tuple[str, str]:
    """Register a real-estate client, then seed a FRESH real-estate lead for the
    SAME mobile. capture_lead always anchors the registration-time lead to
    loans (business_line is immutable), so that auto-captured lead can't be
    reused here — it's closed out first to clear the mobile partial-unique
    index, then a new real_estate lead is inserted for the same mobile.
    Returns (mobile, lead_id).
    """
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    _, mobile = await full_registration(client, lines=["loans", "real_estate"])
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(update(Lead).where(Lead.mobile == mobile).values(status="closed"))
        lead = Lead(
            mobile=mobile,
            business_line="real_estate",
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=(
                uuid.UUID(staff_profile_uuid) if staff_profile_uuid else None
            ),
        )
        db.add(lead)
        await db.commit()
        return mobile, str(lead.id)


async def _seed_property(*, active: bool = True) -> str:
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        prop = Property(
            business_line="real_estate",
            active=active,
            title="Deal Test Apartment",
            type="Apartment",
            location="Test Locality, Test City",
            price_display="₹80 L",
            meta="2 bed",
            category="apartments",
            city="Test City",
            locality="Test Locality",
            pincode="560001",
            price_paise=8_000_000_0,
            bhk=2,
            area_sqft=1100,
            furnishing="furnished",
            construction_status="ready",
            amenities=[],
            age_years=1,
            rera_number=f"RERA/TEST/{uuid.uuid4().hex[:8]}",
            details={},
        )
        db.add(prop)
        await db.commit()
        return str(prop.id)


def _telecaller_token(
    auth_user_uuid: str, staff_profile_uuid: str, business_line: str = "real_estate"
) -> str:
    return create_access_token(
        {
            "sub": auth_user_uuid,
            "role": "telecaller",
            "business_line": business_line,
            "staff_profile_uuid": staff_profile_uuid,
            "platform_scope": "false",
        }
    )


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


async def _auth_user_uuid(mobile: str) -> str:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _create_deal(client: AsyncClient, lead_id: str, property_id: str, headers: dict) -> dict:
    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/property-deals",
        json={"property_id": property_id},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_telecaller_creates_deal(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()

    deal = await _create_deal(client, lead_id, property_id, headers)
    assert deal["status"] == "new"
    assert deal["property_title"] == "Deal Test Apartment"
    assert deal["price_quoted"] is None


@pytest.mark.asyncio
async def test_create_against_unclaimed_lead_rejected(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    lead_id = await _seed_unclaimed_lead("real_estate", tc_staff_uuid)
    property_id = await _seed_property()

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/property-deals",
        json={"property_id": property_id},
        headers=headers,
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_create_against_unknown_property_404(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/property-deals",
        json={"property_id": str(uuid.uuid4())},
        headers=headers,
    )
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_create_against_inactive_property_404(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property(active=False)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/property-deals",
        json={"property_id": property_id},
        headers=headers,
    )
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_create_against_loans_lead_is_404_via_rls(client: AsyncClient) -> None:
    """A real-estate-scoped telecaller's JWT never carries a loans business_line,
    so leads_rls's telecaller branch (business_line = app.business_line) already
    filters out a cross-line lead before create_deal_for_lead's own
    LeadNotRealEstateLine guard would ever run — this exercises RLS doing that
    job, not the app-layer defense-in-depth check."""
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    _, loans_staff_uuid = await _seed_telecaller("loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    lead_id = await _seed_unclaimed_lead("loans", loans_staff_uuid)
    property_id = await _seed_property()

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/property-deals",
        json={"property_id": property_id},
        headers=headers,
    )
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_client_can_hold_multiple_concurrent_deals(client: AsyncClient) -> None:
    """Deliberate deviation from loans: no one-active-deal-per-client constraint."""
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_a = await _seed_property()
    property_b = await _seed_property()

    deal_a = await _create_deal(client, lead_id, property_a, headers)
    deal_b = await _create_deal(client, lead_id, property_b, headers)
    assert deal_a["id"] != deal_b["id"]


@pytest.mark.asyncio
async def test_status_advances_and_terms_gated_until_booked(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "contacted"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "contacted"

    # Terms before BOOKED are rejected.
    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"price_quoted": "8000000"},
        headers=headers,
    )
    assert res.status_code == 422, res.text

    for target in ("site_visit_done", "negotiation", "booked"):
        res = await client.patch(
            f"/api/v1/telecaller/property-deals/{deal['id']}",
            json={"status": target},
            headers=headers,
        )
        assert res.status_code == 200, res.text

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"price_quoted": "8000000", "booking_amount": "500000"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["price_quoted"] == "8000000.00"
    assert body["booking_amount"] == "500000.00"


@pytest.mark.asyncio
async def test_backward_move_rejected(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "contacted"},
        headers=headers,
    )
    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "new"},
        headers=headers,
    )
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_rejected_without_reason_rejected(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "rejected"},
        headers=headers,
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_on_hold_with_reason_then_resume(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "on_hold", "status_reason": "Client travelling"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "on_hold"

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "negotiation"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "negotiation"


@pytest.mark.asyncio
async def test_empty_payload_rejected(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={},
        headers=headers,
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_patch_on_terminal_deal_rejected(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "rejected", "status_reason": "Client backed out"},
        headers=headers,
    )
    assert res.status_code == 200, res.text

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "contacted"},
        headers=headers,
    )
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_unassigned_telecaller_gets_404(client: AsyncClient) -> None:
    owner_uid, owner_staff_uuid = await _seed_telecaller()
    other_uid, other_staff_uuid = await _seed_telecaller()
    owner_headers = {"Authorization": f"Bearer {_telecaller_token(owner_uid, owner_staff_uuid)}"}
    other_headers = {"Authorization": f"Bearer {_telecaller_token(other_uid, other_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, owner_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, owner_headers)

    res = await client.patch(
        f"/api/v1/telecaller/property-deals/{deal['id']}",
        json={"status": "contacted"},
        headers=other_headers,
    )
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_admin_list_and_filter(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    admin_uid = await _auth_user_uuid(await _mobile_for_lead(lead_id))
    admin_headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    res = await client.get("/api/v1/admin/property-deals", headers=admin_headers)
    assert res.status_code == 200, res.text
    ids = {d["id"] for d in res.json()["deals"]}
    assert deal["id"] in ids

    res = await client.get("/api/v1/admin/property-deals?status_filter=new", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert deal["id"] in {d["id"] for d in res.json()["deals"]}

    res = await client.get(
        "/api/v1/admin/property-deals?status_filter=booked", headers=admin_headers
    )
    assert res.status_code == 200, res.text
    assert deal["id"] not in {d["id"] for d in res.json()["deals"]}


@pytest.mark.asyncio
async def test_admin_list_forbidden_for_telecaller(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}

    res = await client.get("/api/v1/admin/property-deals", headers=headers)
    assert res.status_code == 403, res.text


@pytest.mark.asyncio
async def test_admin_patch_overrides_any_telecallers_deal(client: AsyncClient) -> None:
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    _, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, headers)

    admin_uid = await _auth_user_uuid(await _mobile_for_lead(lead_id))
    admin_headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    res = await client.patch(
        f"/api/v1/admin/property-deals/{deal['id']}",
        json={"status": "contacted"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "contacted"


@pytest.mark.asyncio
async def test_admin_patch_not_found(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    admin_uid = await _auth_user_uuid(mobile)
    admin_headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    res = await client.patch(
        f"/api/v1/admin/property-deals/{uuid.uuid4()}",
        json={"status": "contacted"},
        headers=admin_headers,
    )
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_client_sees_own_deal_via_client_get(client: AsyncClient) -> None:
    """Exercises the client-facing GET router (no consuming UI ships this
    slice — this is what confirms the property_deal_status_updated
    notification's href won't dead-end, and that RLS lets the owning client
    read their own deal through the app, not just via a raw SQL check)."""
    tc_uid, tc_staff_uuid = await _seed_telecaller()
    tc_headers = {"Authorization": f"Bearer {_telecaller_token(tc_uid, tc_staff_uuid)}"}
    mobile, lead_id = await _seed_registered_lead(client, tc_staff_uuid)
    property_id = await _seed_property()
    deal = await _create_deal(client, lead_id, property_id, tc_headers)

    client_token = await do_login(client, mobile)
    client_headers = {"Authorization": f"Bearer {client_token}"}

    res = await client.get("/api/v1/property-deals", headers=client_headers)
    assert res.status_code == 200, res.text
    ids = {d["id"] for d in res.json()["deals"]}
    assert deal["id"] in ids

    res = await client.get(f"/api/v1/property-deals/{deal['id']}", headers=client_headers)
    assert res.status_code == 200, res.text
    assert res.json()["property"]["title"] == "Deal Test Apartment"


async def _mobile_for_lead(lead_id: str) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead

    async with _session_mod.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id))
        assert lead is not None
        return lead.mobile
