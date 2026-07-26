"""Admin lead-assign endpoint — POST /api/v1/admin/leads/{id}/assign.

Mints role-specific access tokens for an already-registered auth_user, same
pattern as test_admin_agents.py. Leads and staff profiles are seeded directly via
the bypass superuser session (no public lead-assign UI/queue exists this slice).
"""

from __future__ import annotations

import uuid

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


async def _seed_lead(business_line: str | None, status: str = "new") -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus(status),
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_telecaller_staff_profile(business_line: str = "loans", active: bool = True) -> str:
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
            status=ProfileStatus.ACTIVE if active else ProfileStatus.INACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "false"}
    )


@pytest.mark.asyncio
async def test_admin_assigns_lead_to_telecaller(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead("loans")
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["lead_id"] == lead_id
    assert body["telecaller_staff_profile_uuid"] == telecaller_uuid
    assert body["status"] == "assigned"


@pytest.mark.asyncio
async def test_already_assigned_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead("loans")
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    first = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers=headers,
    )
    assert first.status_code == 200, first.text

    other_telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    second = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": other_telecaller_uuid},
        headers=headers,
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_line_mismatch_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead("loans")
    telecaller_uuid = await _seed_telecaller_staff_profile("real_estate")

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_unresolved_line_lead_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead(None)
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_inactive_telecaller_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead("loans")
    telecaller_uuid = await _seed_telecaller_staff_profile("loans", active=False)

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_missing_lead_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")

    res = await client.post(
        f"/api/v1/admin/leads/{uuid.uuid4()}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_cannot_assign(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead("loans")
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_list_unassigned_leads_returns_assignable_only(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    assignable_id = await _seed_lead("loans")
    untriaged_id = await _seed_lead(None)
    already_assigned_telecaller = await _seed_telecaller_staff_profile("loans")
    assigned_id = await _seed_lead("loans")
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}
    await client.post(
        f"/api/v1/admin/leads/{assigned_id}/assign",
        json={"telecaller_staff_profile_uuid": already_assigned_telecaller},
        headers=headers,
    )

    res = await client.get("/api/v1/admin/leads", headers=headers)
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert assignable_id in ids
    assert untriaged_id not in ids
    assert assigned_id not in ids


@pytest.mark.asyncio
async def test_converted_orphaned_fk_lead_not_listed_and_not_assignable(
    client: AsyncClient,
) -> None:
    """Orphaned-FK edge case (H1): a lead that was assigned then converted, whose
    assigned_telecaller_profile_uuid later went NULL (e.g. via the telecaller's
    staff profile being removed — ondelete="SET NULL"), must NOT resurface as
    "unassigned" in the queue, and must NOT be assignable — that would rewind a
    forward-only lifecycle from converted back to assigned."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    orphaned_converted_id = await _seed_lead("loans", status="converted")
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.get("/api/v1/admin/leads", headers=headers)
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert orphaned_converted_id not in ids

    assign_res = await client.post(
        f"/api/v1/admin/leads/{orphaned_converted_id}/assign",
        json={"telecaller_staff_profile_uuid": telecaller_uuid},
        headers=headers,
    )
    assert assign_res.status_code == 409, assign_res.text


@pytest.mark.asyncio
async def test_non_admin_cannot_list_leads(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    res = await client.get(
        "/api/v1/admin/leads", headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_list_leads_respects_limit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    for _ in range(3):
        await _seed_lead("loans")
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.get("/api/v1/admin/leads?limit=2", headers=headers)
    assert res.status_code == 200, res.text
    assert len(res.json()) <= 2


@pytest.mark.asyncio
async def test_list_leads_rejects_limit_over_max(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    res = await client.get(
        "/api/v1/admin/leads?limit=501",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422
