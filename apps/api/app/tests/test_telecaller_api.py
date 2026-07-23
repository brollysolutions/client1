"""Telecaller API — list/detail/update leads, log calls, home summary.

Mints a telecaller access token for an already-registered auth_user (same pattern
as test_property_submissions_api.py) with a real StaffProfile id in the
staff_profile_uuid claim, since the telecaller endpoints/RLS key off it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _seed_telecaller(business_line: str = "loans") -> tuple[str, str]:
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


async def _seed_assigned_lead(
    business_line: str, staff_profile_uuid: str, status: str = "assigned"
) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus(status),
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(staff_profile_uuid),
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


def _telecaller_token(
    auth_user_uuid: str, staff_profile_uuid: str, business_line: str = "loans"
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


@pytest.mark.asyncio
async def test_list_leads_returns_assigned(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.get(
        "/api/v1/telecaller/leads",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert lead_id in ids


@pytest.mark.asyncio
async def test_get_lead_detail(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == lead_id
    assert body["activities"] == []


@pytest.mark.asyncio
async def test_get_lead_not_owned_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    _, other_staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", other_staff_uuid)

    res = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_lead_status(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.patch(
        f"/api/v1/telecaller/leads/{lead_id}",
        json={"status": "converted"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "converted"


@pytest.mark.asyncio
async def test_patch_lead_empty_payload_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.patch(
        f"/api/v1/telecaller/leads/{lead_id}",
        json={},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_log_call_activity_success(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid, status="assigned")

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "connected", "interest_level": "hot", "notes": "Very interested."},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["disposition"] == "connected"

    # First-contact bump: assigned -> working.
    detail = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert detail.json()["status"] == "working"


@pytest.mark.asyncio
async def test_log_call_activity_missing_interest_level_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "connected"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_log_call_activity_follow_up_in_past_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "no_answer", "follow_up_at": past},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_log_call_activity_for_unowned_lead_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    _, other_staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", other_staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "no_answer"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_home_summary(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid, status="assigned")
    future = (datetime.now(UTC) + timedelta(minutes=1)).isoformat()

    # Log a call with a near-future follow-up, then check counts/home shape.
    log_res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "callback_requested", "follow_up_at": future},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert log_res.status_code == 201, log_res.text

    res = await client.get(
        "/api/v1/telecaller/home",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["counts_by_status"].get("working") == 1
    assert isinstance(body["follow_ups_due"], list)


@pytest.mark.asyncio
async def test_non_telecaller_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get("/api/v1/telecaller/leads", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.get("/api/v1/telecaller/leads")
    assert res.status_code == 401
