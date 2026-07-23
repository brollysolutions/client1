"""Admin task queue — GET /api/v1/admin/tasks, POST /api/v1/admin/tasks/{id}/assign.

Mints role-specific access tokens for an already-registered auth_user, same
pattern as test_admin_leads_assign.py. Tasks/staff profiles are seeded directly
via the bypass superuser session (no telecaller-raise-task UI flow needed here).
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


async def _seed_staff_profile(role: str, business_line: str = "loans", active: bool = True) -> str:
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Staff",
            mobile=unique_mobile(),
            email=f"st_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole(role),
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"ST-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE if active else ProfileStatus.INACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _seed_task(
    business_line: str, raised_by_staff_uuid: str, status: str = "unassigned"
) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.task import Task, TaskStatus, TaskType

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(raised_by_staff_uuid),
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=uuid.UUID(raised_by_staff_uuid),
            business_line=business_line,
            task_type=TaskType.DOCUMENT_COLLECTION,
            lead_uuid=lead.id,
            status=TaskStatus(status),
        )
        db.add(task)
        await db.commit()
        return str(task.id)


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "false"}
    )


@pytest.mark.asyncio
async def test_list_unassigned_tasks(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)

    res = await client.get(
        "/api/v1/admin/tasks?status_filter=unassigned",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert task_id in ids


@pytest.mark.asyncio
async def test_non_admin_cannot_list_tasks(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    res = await client.get(
        "/api/v1/admin/tasks", headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_assigns_task_to_employee(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)
    employee_uuid = await _seed_staff_profile("employee", "loans")

    res = await client.post(
        f"/api/v1/admin/tasks/{task_id}/assign",
        json={"employee_profile_uuid": employee_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "assigned"
    assert body["assigned_employee_profile_uuid"] == employee_uuid
    assert body["outcome"] is None


@pytest.mark.asyncio
async def test_assign_already_assigned_task_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)
    employee_uuid = await _seed_staff_profile("employee", "loans")
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    first = await client.post(
        f"/api/v1/admin/tasks/{task_id}/assign",
        json={"employee_profile_uuid": employee_uuid},
        headers=headers,
    )
    assert first.status_code == 200, first.text

    other_employee_uuid = await _seed_staff_profile("employee", "loans")
    second = await client.post(
        f"/api/v1/admin/tasks/{task_id}/assign",
        json={"employee_profile_uuid": other_employee_uuid},
        headers=headers,
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_assign_to_wrong_role_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)
    # A telecaller profile is not a valid assignee — must be an employee.
    non_employee_uuid = await _seed_staff_profile("telecaller", "loans")

    res = await client.post(
        f"/api/v1/admin/tasks/{task_id}/assign",
        json={"employee_profile_uuid": non_employee_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_assign_line_mismatch_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)
    re_employee_uuid = await _seed_staff_profile("employee", "real_estate")

    res = await client.post(
        f"/api/v1/admin/tasks/{task_id}/assign",
        json={"employee_profile_uuid": re_employee_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_assign_inactive_employee_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)
    inactive_employee_uuid = await _seed_staff_profile("employee", "loans", active=False)

    res = await client.post(
        f"/api/v1/admin/tasks/{task_id}/assign",
        json={"employee_profile_uuid": inactive_employee_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_assign_missing_task_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    employee_uuid = await _seed_staff_profile("employee", "loans")

    res = await client.post(
        f"/api/v1/admin/tasks/{uuid.uuid4()}/assign",
        json={"employee_profile_uuid": employee_uuid},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_cannot_assign(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)
    employee_uuid = await _seed_staff_profile("employee", "loans")

    res = await client.post(
        f"/api/v1/admin/tasks/{task_id}/assign",
        json={"employee_profile_uuid": employee_uuid},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403
