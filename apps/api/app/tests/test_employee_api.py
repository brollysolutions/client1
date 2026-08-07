"""Employee API — assigned-task list/detail, status/outcome update, home summary.

Mints an employee access token for an already-registered auth_user (same
pattern as test_telecaller_api.py) with a real StaffProfile id in the
staff_profile_uuid claim, since the employee endpoints/RLS key off it.
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


async def _seed_staff_profile(role: str, business_line: str = "loans") -> str:
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
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _seed_employee(business_line: str = "loans") -> tuple[str, str]:
    """Create an auth_user + employee StaffProfile. Returns (auth_user_uuid, staff_uuid)."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Employee",
            mobile=unique_mobile(),
            email=f"em_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.EMPLOYEE,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"EM-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _seed_task(
    business_line: str,
    employee_staff_uuid: str | None = None,
    task_type: str = "document_collection",
    status: str = "assigned",
    due_at: datetime | None = None,
    outcome: str | None = None,
) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.task import BgCheckOutcome, Task, TaskStatus, TaskType

    raiser_uuid = await _seed_staff_profile("telecaller", business_line)

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(raiser_uuid),
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=uuid.UUID(raiser_uuid),
            assigned_employee_profile_uuid=(
                uuid.UUID(employee_staff_uuid) if employee_staff_uuid else None
            ),
            business_line=business_line,
            task_type=TaskType(task_type),
            lead_uuid=lead.id,
            status=TaskStatus(status),
            due_at=due_at,
            outcome=BgCheckOutcome(outcome) if outcome else None,
        )
        db.add(task)
        await db.commit()
        return str(task.id)


def _employee_token(
    auth_user_uuid: str, staff_profile_uuid: str, business_line: str = "loans"
) -> str:
    return create_access_token(
        {
            "sub": auth_user_uuid,
            "role": "employee",
            "business_line": business_line,
            "staff_profile_uuid": staff_profile_uuid,
            "platform_scope": "false",
        }
    )


@pytest.mark.asyncio
async def test_non_employee_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get("/api/v1/employee/tasks", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.get("/api/v1/employee/tasks")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_list_scoped_to_own_tasks_only(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("loans")
    _, staff_b = await _seed_employee("loans")
    task_a = await _seed_task("loans", staff_a)
    task_b = await _seed_task("loans", staff_b)

    res = await client.get(
        "/api/v1/employee/tasks",
        headers={"Authorization": f"Bearer {_employee_token(auth_a, staff_a)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert task_a in ids
    assert task_b not in ids


@pytest.mark.asyncio
async def test_cross_line_task_is_404(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("real_estate")
    task_id = await _seed_task("loans", None)  # unassigned loans task, different line entirely

    res = await client.get(
        f"/api/v1/employee/tasks/{task_id}",
        headers={"Authorization": f"Bearer {_employee_token(auth_a, staff_a, 'real_estate')}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cross_employee_same_line_get_by_id_is_404(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("loans")
    _, staff_b = await _seed_employee("loans")
    task_b = await _seed_task("loans", staff_b)

    res = await client.get(
        f"/api/v1/employee/tasks/{task_b}",
        headers={"Authorization": f"Bearer {_employee_token(auth_a, staff_a)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cross_employee_same_line_patch_by_id_is_404(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("loans")
    _, staff_b = await _seed_employee("loans")
    task_b = await _seed_task("loans", staff_b)

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_b}",
        json={"notes": "trying to touch someone else's task"},
        headers={"Authorization": f"Bearer {_employee_token(auth_a, staff_a)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_illegal_transition_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, status="completed")

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_terminal_task_locked(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, status="cancelled")

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"notes": "trying to edit a closed task"},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_background_check_outcome_required(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task(
        "loans", staff_uuid, task_type="background_check", status="in_progress"
    )

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"status": "completed"},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_background_check_outcome_accepted(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task(
        "loans", staff_uuid, task_type="background_check", status="in_progress"
    )

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"status": "completed", "outcome": "clear", "notes": "Verified employer records."},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "completed"
    assert body["outcome"] == "clear"


@pytest.mark.asyncio
async def test_outcome_rejected_on_wrong_task_type(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task(
        "loans", staff_uuid, task_type="document_collection", status="in_progress"
    )

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"outcome": "clear"},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_notes_only_update_mid_flight(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, status="in_progress")

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"notes": "Collected 2 of 3 documents so far."},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "in_progress"
    assert body["notes"] == "Collected 2 of 3 documents so far."


@pytest.mark.asyncio
async def test_self_transition_is_a_no_op_not_conflict(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, status="in_progress")

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_assigned_to_blocked_direct_transition(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, status="assigned")

    res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"status": "blocked", "notes": "Can't reach the address yet."},
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "blocked"


@pytest.mark.asyncio
async def test_home_summary_shape(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.employee as employee_service

    frozen_now = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):  # noqa: ANN001
            return frozen_now if tz is not None else frozen_now.replace(tzinfo=None)

    monkeypatch.setattr(employee_service, "datetime", FrozenDateTime)
    auth_uuid, staff_uuid = await _seed_employee("loans")
    await _seed_task("loans", staff_uuid, status="assigned", due_at=frozen_now - timedelta(hours=2))
    await _seed_task("loans", staff_uuid, status="assigned", due_at=frozen_now + timedelta(hours=2))
    await _seed_task("loans", staff_uuid, status="assigned", due_at=frozen_now + timedelta(days=5))

    res = await client.get(
        "/api/v1/employee/home",
        headers={"Authorization": f"Bearer {_employee_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["overdue_count"] == 1
    assert len(body["tasks_today"]) == 2  # overdue + due-later-today both fall on "today"
    assert body["counts_by_status"].get("assigned") == 3
    assert body["counts_by_type"].get("document_collection") == 3
