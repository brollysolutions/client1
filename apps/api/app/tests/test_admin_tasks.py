"""Read-only Admin task oversight and active operational-staff lookup.

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
    business_line: str,
    raised_by_staff_uuid: str,
    status: str = "unassigned",
    task_type: str = "document_collection",
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
            task_type=TaskType(task_type),
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
async def test_list_tasks_filters_property_visits_and_rejects_invalid_filters(
    client: AsyncClient,
) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    raiser_uuid = await _seed_staff_profile("telecaller", "real_estate")
    visit_id = await _seed_task(
        "real_estate",
        raiser_uuid,
        status="assigned",
        task_type="property_visit",
    )
    document_id = await _seed_task(
        "real_estate",
        raiser_uuid,
        status="assigned",
        task_type="document_collection",
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    response = await client.get(
        "/api/v1/admin/tasks?task_type_filter=property_visit&limit=50",
        headers=headers,
    )
    invalid = await client.get(
        "/api/v1/admin/tasks?task_type_filter=not-a-task",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    ids = {row["id"] for row in response.json()}
    assert visit_id in ids
    assert document_id not in ids
    assert invalid.status_code == 422, invalid.text


@pytest.mark.asyncio
async def test_non_admin_cannot_list_tasks(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    res = await client.get(
        "/api/v1/admin/tasks", headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_task_assignment_endpoint_is_removed(client: AsyncClient) -> None:
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
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_list_employees_returns_active_employees_only(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    active_uuid = await _seed_staff_profile("employee", "loans")
    inactive_uuid = await _seed_staff_profile("employee", "loans", active=False)
    telecaller_uuid = await _seed_staff_profile("telecaller", "loans")

    res = await client.get(
        "/api/v1/admin/employees",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert active_uuid in ids
    assert inactive_uuid not in ids
    assert telecaller_uuid not in ids


@pytest.mark.asyncio
async def test_list_employees_filters_by_business_line(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    loans_uuid = await _seed_staff_profile("employee", "loans")
    re_uuid = await _seed_staff_profile("employee", "real_estate")
    both_uuid = await _seed_staff_profile("employee", "both")

    res = await client.get(
        "/api/v1/admin/employees?business_line=loans",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert loans_uuid in ids
    assert both_uuid in ids
    assert re_uuid not in ids


@pytest.mark.asyncio
async def test_non_admin_cannot_list_employees(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    res = await client.get(
        "/api/v1/admin/employees",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_list_employees_role_param_returns_telecallers(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    telecaller_uuid = await _seed_staff_profile("telecaller", "loans")
    employee_uuid = await _seed_staff_profile("employee", "loans")

    res = await client.get(
        "/api/v1/admin/employees?role=telecaller",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert telecaller_uuid in ids
    assert employee_uuid not in ids


@pytest.mark.asyncio
async def test_list_employees_default_role_unchanged(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    employee_uuid = await _seed_staff_profile("employee", "loans")
    telecaller_uuid = await _seed_staff_profile("telecaller", "loans")

    res = await client.get(
        "/api/v1/admin/employees",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert employee_uuid in ids
    assert telecaller_uuid not in ids


@pytest.mark.asyncio
async def test_list_employees_role_param_rejects_platform_scoped_roles(
    client: AsyncClient,
) -> None:
    """H2 regression: sub_admin/admin are valid StaffRole values but have a
    nullable (platform-scoped) business_line — AdminEmployeeRead.business_line is
    a required Literal["loans", "real_estate"], so constructing it from a
    sub_admin/admin StaffProfile 500s. The `role` query param is constrained to
    Literal["employee", "telecaller"] so FastAPI 422s before the route body runs."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    res = await client.get(
        "/api/v1/admin/employees?role=sub_admin",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422, res.text

    res = await client.get(
        "/api/v1/admin/employees?role=admin",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422, res.text
