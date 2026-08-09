"""Admin lead-release/reassign endpoint — POST /api/v1/admin/leads/{id}/release
and GET /api/v1/admin/leads/assigned.

Mints role-specific access tokens for an already-registered auth_user, same
pattern as test_admin_leads_assign.py. Leads and staff profiles are seeded
directly via the bypass superuser session.
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


async def _seed_lead(
    business_line: str,
    status: str = "new",
    assigned_telecaller_profile_uuid: str | None = None,
) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus(status),
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=assigned_telecaller_profile_uuid,
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


async def _assignment_audit(lead_id: str):
    from sqlalchemy import select

    import app.db.session as _session_mod
    from app.models.audit_log import AuditAction, AuditLog

    async with _session_mod.AsyncSessionLocal() as db:
        return await db.scalar(
            select(AuditLog).where(
                AuditLog.entity_uuid == uuid.UUID(lead_id),
                AuditLog.action == AuditAction.LEAD_ASSIGNED,
            )
        )


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "false"}
    )


@pytest.mark.asyncio
async def test_release_to_queue_happy_path(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead(
        "loans", status="assigned", assigned_telecaller_profile_uuid=telecaller_uuid
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/release",
        json={},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "released"
    assert body["telecaller_staff_profile_uuid"] is None
    assert body["previous_telecaller_staff_profile_uuid"] == telecaller_uuid
    assert body["released_at"] is not None

    queue_res = await client.get("/api/v1/admin/leads", headers=headers)
    assert queue_res.status_code == 200, queue_res.text
    ids = [row["id"] for row in queue_res.json()]
    assert lead_id in ids


@pytest.mark.asyncio
async def test_reassign_happy_path(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_a = await _seed_telecaller_staff_profile("loans")
    telecaller_b = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead(
        "loans", status="working", assigned_telecaller_profile_uuid=telecaller_a
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/release",
        json={"telecaller_staff_profile_uuid": telecaller_b, "release_reason": "A left the team"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "assigned"
    assert body["telecaller_staff_profile_uuid"] == telecaller_b
    assert body["previous_telecaller_staff_profile_uuid"] == telecaller_a
    assert body["release_reason"] == "A left the team"
    audit = await _assignment_audit(lead_id)
    assert audit is not None
    assert str(audit.actor_uuid) == uid
    assert audit.actor_role == "admin"
    assert audit.detail == {
        "mode": "manual_reassignment",
        "telecaller_staff_profile_uuid": telecaller_b,
        "previous_telecaller_staff_profile_uuid": telecaller_a,
    }

    queue_res = await client.get("/api/v1/admin/leads", headers=headers)
    assert queue_res.status_code == 200, queue_res.text
    ids = [row["id"] for row in queue_res.json()]
    assert lead_id not in ids


@pytest.mark.asyncio
async def test_release_rejects_new_lead(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead("loans", status="new")
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.post(f"/api/v1/admin/leads/{lead_id}/release", json={}, headers=headers)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_release_rejects_converted_lead(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead(
        "loans", status="converted", assigned_telecaller_profile_uuid=telecaller_uuid
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.post(f"/api/v1/admin/leads/{lead_id}/release", json={}, headers=headers)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_release_orphaned_fk_lead_repairs_it(client: AsyncClient) -> None:
    """A lead assigned=True but assigned_telecaller_profile_uuid=NULL (the FK went
    NULL via ondelete=SET NULL while status stayed assigned) is exactly the case
    release exists to repair: it must surface in GET /leads/assigned with a null
    assignee, and release-with-no-target must succeed (200, not 409), making it
    assignable again."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead("loans", status="assigned", assigned_telecaller_profile_uuid=None)
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    assigned_res = await client.get("/api/v1/admin/leads/assigned", headers=headers)
    assert assigned_res.status_code == 200, assigned_res.text
    row = next(r for r in assigned_res.json() if r["id"] == lead_id)
    assert row["assigned_telecaller_staff_profile_uuid"] is None

    release_res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/release", json={}, headers=headers
    )
    assert release_res.status_code == 200, release_res.text
    assert release_res.json()["status"] == "released"

    queue_res = await client.get("/api/v1/admin/leads", headers=headers)
    ids = [r["id"] for r in queue_res.json()]
    assert lead_id in ids


@pytest.mark.asyncio
async def test_reassign_line_mismatch_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_a = await _seed_telecaller_staff_profile("loans")
    wrong_line_telecaller = await _seed_telecaller_staff_profile("real_estate")
    lead_id = await _seed_lead(
        "loans", status="assigned", assigned_telecaller_profile_uuid=telecaller_a
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/release",
        json={"telecaller_staff_profile_uuid": wrong_line_telecaller},
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reassign_inactive_telecaller_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_a = await _seed_telecaller_staff_profile("loans")
    inactive_telecaller = await _seed_telecaller_staff_profile("loans", active=False)
    lead_id = await _seed_lead(
        "loans", status="assigned", assigned_telecaller_profile_uuid=telecaller_a
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/release",
        json={"telecaller_staff_profile_uuid": inactive_telecaller},
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_missing_lead_release_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.post(f"/api/v1/admin/leads/{uuid.uuid4()}/release", json={}, headers=headers)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_cannot_release(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead(
        "loans", status="assigned", assigned_telecaller_profile_uuid=telecaller_uuid
    )

    res = await client.post(
        f"/api/v1/admin/leads/{lead_id}/release",
        json={},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_list_assigned_leads_excludes_unassigned_and_terminal(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    new_id = await _seed_lead("loans", status="new")
    assigned_id = await _seed_lead(
        "loans", status="assigned", assigned_telecaller_profile_uuid=telecaller_uuid
    )
    converted_id = await _seed_lead(
        "loans", status="converted", assigned_telecaller_profile_uuid=telecaller_uuid
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.get("/api/v1/admin/leads/assigned", headers=headers)
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert assigned_id in ids
    assert new_id not in ids
    assert converted_id not in ids
    row = next(r for r in res.json() if r["id"] == assigned_id)
    assert row["assigned_telecaller_staff_profile_uuid"] == telecaller_uuid
    assert row["assigned_telecaller_name"] == "Test Telecaller"


@pytest.mark.asyncio
async def test_list_assigned_leads_respects_limit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    for _ in range(3):
        await _seed_lead(
            "loans", status="assigned", assigned_telecaller_profile_uuid=telecaller_uuid
        )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    res = await client.get("/api/v1/admin/leads/assigned?limit=2", headers=headers)
    assert res.status_code == 200, res.text
    assert len(res.json()) <= 2


@pytest.mark.asyncio
async def test_non_admin_cannot_list_assigned_leads(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    res = await client.get(
        "/api/v1/admin/leads/assigned",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403
