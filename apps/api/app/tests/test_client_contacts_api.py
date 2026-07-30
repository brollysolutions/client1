"""GET /api/v1/loans/officer + GET /api/v1/property-deals/agent (feature-status §2-7).

Both endpoints answer "who is helping me" for a dual-line client, anchored on
the client's most recent LoanApplication / PropertyDeal -> its lead's
assigned_telecaller_profile_uuid / origin_agent_profile_uuid. Deliberately
NOT RLS-scoped (see services/contacts.py docstring): a dual-line client's JWT
only ever carries the LOANS client_profile_uuid, so a real-estate lookup
keyed off that claim would silently see nothing. These tests exercise the
explicit auth_user_uuid + business_line join instead.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus
from app.models.property_deal import PropertyDeal, PropertyDealStatus
from conftest import full_registration, unique_mobile


async def _client_profile_uuid(mobile: str, business_line: str) -> uuid.UUID:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT cp.id FROM client_profiles cp "
                    "JOIN auth_users u ON u.id = cp.auth_user_uuid "
                    "WHERE u.mobile = :m AND cp.business_line = :line"
                ),
                {"m": mobile, "line": business_line},
            )
        ).fetchone()
        assert row is not None, f"no {business_line} client_profile for {mobile}"
        return row[0]


async def _seed_telecaller(
    *, first_name: str = "Arjun", last_name: str = "Mehta"
) -> tuple[str, str]:
    """Create an auth_user + telecaller StaffProfile. Returns (staff_profile_uuid, staff_code)."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name=first_name,
            last_name=last_name,
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        staff_code = f"TC-{uuid.uuid4().hex[:8]}"
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line="loans",
            staff_code=staff_code,
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id), staff_code


async def _seed_agent(*, first_name: str = "Priya", last_name: str = "Nair") -> tuple[str, str]:
    """Create an auth_user + AgentProfile. Returns (agent_profile_uuid, agent_code)."""
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name=first_name,
            last_name=last_name,
            mobile=unique_mobile(),
            email=f"ag_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        agent_code = f"AG-{uuid.uuid4().hex[:8]}"
        profile = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=agent_code,
            business_line="real_estate",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id), agent_code


async def _loan_type_id() -> uuid.UUID:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (await db.execute(text("SELECT id FROM loan_types LIMIT 1"))).fetchone()
        assert row is not None, "loan_types seed missing — run migration 1a2b3c4d5e6f"
        return row[0]


async def _property_id() -> uuid.UUID:
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        prop = Property(
            business_line="real_estate",
            active=True,
            title="Contact Test Apartment",
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
        return prop.id


@pytest.mark.asyncio
async def test_no_officer_before_any_loan_application(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    res = await client.get("/api/v1/loans/officer", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.json() is None


@pytest.mark.asyncio
async def test_officer_returned_for_most_recent_application(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile, "loans")
    staff_uuid, staff_code = await _seed_telecaller()
    loan_type_id = await _loan_type_id()

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            client_profile_uuid=cpu,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(staff_uuid),
        )
        db.add(lead)
        await db.flush()
        db.add(
            LoanApplication(
                lead_uuid=lead.id,
                client_profile_uuid=cpu,
                business_line="loans",
                loan_type_id=loan_type_id,
                status=LoanStatus.NEW,
            )
        )
        await db.commit()

    res = await client.get("/api/v1/loans/officer", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Arjun Mehta"
    assert body["staff_code"] == staff_code
    assert set(body.keys()) == {"name", "staff_code"}


@pytest.mark.asyncio
async def test_officer_null_when_lead_has_no_assigned_telecaller(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile, "loans")
    loan_type_id = await _loan_type_id()

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            client_profile_uuid=cpu,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.flush()
        db.add(
            LoanApplication(
                lead_uuid=lead.id,
                client_profile_uuid=cpu,
                business_line="loans",
                loan_type_id=loan_type_id,
                status=LoanStatus.NEW,
            )
        )
        await db.commit()

    res = await client.get("/api/v1/loans/officer", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.json() is None


@pytest.mark.asyncio
async def test_no_agent_before_any_property_deal(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    res = await client.get(
        "/api/v1/property-deals/agent", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200, res.text
    assert res.json() is None


@pytest.mark.asyncio
async def test_agent_returned_for_most_recent_deal(client: AsyncClient) -> None:
    """The dual-line-claim regression test: register BOTH lines (so the JWT's
    client_profile_uuid claim is the LOANS profile, per
    client-profile-uuid-single-claim-gotcha), and confirm the real-estate
    agent lookup still resolves via the explicit auth_user_uuid join."""
    token, mobile = await full_registration(client, lines=["loans", "real_estate"])
    cpu = await _client_profile_uuid(mobile, "real_estate")
    agent_uuid, agent_code = await _seed_agent()
    property_id = await _property_id()

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="real_estate",
            client_profile_uuid=cpu,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.AGENT,
            origin_agent_profile_uuid=uuid.UUID(agent_uuid),
        )
        db.add(lead)
        await db.flush()
        db.add(
            PropertyDeal(
                lead_uuid=lead.id,
                client_profile_uuid=cpu,
                property_id=property_id,
                business_line="real_estate",
                status=PropertyDealStatus.NEW,
            )
        )
        await db.commit()

    res = await client.get(
        "/api/v1/property-deals/agent", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Priya Nair"
    assert body["agent_code"] == agent_code
    assert set(body.keys()) == {"name", "agent_code"}


@pytest.mark.asyncio
async def test_agent_null_when_lead_has_no_origin_agent(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["real_estate"])
    cpu = await _client_profile_uuid(mobile, "real_estate")
    property_id = await _property_id()

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="real_estate",
            client_profile_uuid=cpu,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.flush()
        db.add(
            PropertyDeal(
                lead_uuid=lead.id,
                client_profile_uuid=cpu,
                property_id=property_id,
                business_line="real_estate",
                status=PropertyDealStatus.NEW,
            )
        )
        await db.commit()

    res = await client.get(
        "/api/v1/property-deals/agent", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200, res.text
    assert res.json() is None


@pytest.mark.asyncio
async def test_officer_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/loans/officer")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_agent_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/property-deals/agent")
    assert res.status_code == 401
