"""Employee document-upload API — presign, confirm, list, delete.

Mints an employee access token the same way test_employee_api.py does.
Presigning/download-url generation are pure local boto3 signing calls, so
these tests never need a reachable minio/Spaces endpoint. delete_document's
storage-side delete is best-effort (services/storage.py swallows failures),
so it's also safe to exercise without live storage.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from conftest import unique_mobile


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
    employee_staff_uuid: str | None,
    task_type: str = "document_collection",
    status: str = "assigned",
) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.task import Task, TaskStatus, TaskType
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        raiser_user = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(raiser_user)
        await db.flush()
        raiser_profile = StaffProfile(
            auth_user_uuid=raiser_user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(raiser_profile)
        await db.flush()

        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=raiser_profile.id,
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=raiser_profile.id,
            assigned_employee_profile_uuid=(
                uuid.UUID(employee_staff_uuid) if employee_staff_uuid else None
            ),
            business_line=business_line,
            task_type=TaskType(task_type),
            lead_uuid=lead.id,
            status=TaskStatus(status),
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


async def _presign(client: AsyncClient, token: str, task_id: str, doc_type: str = "pan"):
    return await client.post(
        f"/api/v1/employee/tasks/{task_id}/documents/presign",
        json={"doc_type": doc_type, "content_type": "application/pdf"},
        headers={"Authorization": f"Bearer {token}"},
    )


async def _confirm(
    client: AsyncClient, token: str, task_id: str, object_key: str, doc_type: str = "pan"
):
    return await client.post(
        f"/api/v1/employee/tasks/{task_id}/documents",
        json={"doc_type": doc_type, "object_key": object_key},
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.mark.asyncio
async def test_presign_happy_path(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid)
    token = _employee_token(auth_uuid, staff_uuid)

    res = await _presign(client, token, task_id)
    assert res.status_code == 200, res.text
    body = res.json()
    assert task_id in body["object_key"]
    assert body["upload_url"].startswith("http")


@pytest.mark.asyncio
async def test_presign_wrong_task_type_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, task_type="property_visit")
    token = _employee_token(auth_uuid, staff_uuid)

    res = await _presign(client, token, task_id)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_presign_terminal_task_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, status="completed")
    token = _employee_token(auth_uuid, staff_uuid)

    res = await _presign(client, token, task_id)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_cross_employee_presign_is_404(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("loans")
    _, staff_b = await _seed_employee("loans")
    task_b = await _seed_task("loans", staff_b)
    token_a = _employee_token(auth_a, staff_a)

    res = await _presign(client, token_a, task_b)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cross_employee_confirm_is_404(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("loans")
    _, staff_b = await _seed_employee("loans")
    task_b = await _seed_task("loans", staff_b)
    token_a = _employee_token(auth_a, staff_a)

    res = await _confirm(client, token_a, task_b, f"tasks/{task_b}/x-pan")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cross_employee_delete_is_404(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("loans")
    auth_b, staff_b = await _seed_employee("loans")
    task_b = await _seed_task("loans", staff_b)
    token_a = _employee_token(auth_a, staff_a)
    token_b = _employee_token(auth_b, staff_b)

    presign_res = await _presign(client, token_b, task_b)
    object_key = presign_res.json()["object_key"]
    confirm_res = await _confirm(client, token_b, task_b, object_key)
    document_id = confirm_res.json()["id"]

    res = await client.delete(
        f"/api/v1/employee/tasks/{task_b}/documents/{document_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_confirm_then_list_round_trip(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid)
    token = _employee_token(auth_uuid, staff_uuid)

    presign_res = await _presign(client, token, task_id, doc_type="salary_slip")
    object_key = presign_res.json()["object_key"]

    confirm_res = await _confirm(client, token, task_id, object_key, doc_type="salary_slip")
    assert confirm_res.status_code == 200, confirm_res.text
    created = confirm_res.json()
    assert created["doc_type"] == "salary_slip"
    assert created["verified"] is False
    assert created["download_url"].startswith("http")

    list_res = await client.get(
        f"/api/v1/employee/tasks/{task_id}/documents",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_res.status_code == 200, list_res.text
    doc_ids = [row["id"] for row in list_res.json()]
    assert created["id"] in doc_ids


@pytest.mark.asyncio
async def test_confirm_terminal_task_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid, status="cancelled")
    token = _employee_token(auth_uuid, staff_uuid)

    res = await _confirm(client, token, task_id, "tasks/x/y-pan")
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_confirm_with_foreign_object_key_rejected(client: AsyncClient) -> None:
    """object_key must fall under this task's own tasks/{task_id}/ prefix —
    a client can't attach an object presigned for (or lifted from) a
    different task (security review finding)."""
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid)
    token = _employee_token(auth_uuid, staff_uuid)

    other_task_id = await _seed_task("loans", staff_uuid)
    res = await _confirm(client, token, task_id, f"tasks/{other_task_id}/abc-pan")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_delete_document_happy_path(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid)
    token = _employee_token(auth_uuid, staff_uuid)

    presign_res = await _presign(client, token, task_id)
    object_key = presign_res.json()["object_key"]
    confirm_res = await _confirm(client, token, task_id, object_key)
    document_id = confirm_res.json()["id"]

    delete_res = await client.delete(
        f"/api/v1/employee/tasks/{task_id}/documents/{document_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_res.status_code == 204

    list_res = await client.get(
        f"/api/v1/employee/tasks/{task_id}/documents",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_res.json() == []


@pytest.mark.asyncio
async def test_delete_nonexistent_document_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid)
    token = _employee_token(auth_uuid, staff_uuid)

    res = await client.delete(
        f"/api/v1/employee/tasks/{task_id}/documents/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_on_terminal_task_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_employee("loans")
    task_id = await _seed_task("loans", staff_uuid)
    token = _employee_token(auth_uuid, staff_uuid)

    presign_res = await _presign(client, token, task_id)
    object_key = presign_res.json()["object_key"]
    confirm_res = await _confirm(client, token, task_id, object_key)
    document_id = confirm_res.json()["id"]

    patch_res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_res.status_code == 200, patch_res.text
    patch_res = await client.patch(
        f"/api/v1/employee/tasks/{task_id}",
        json={"status": "completed", "notes": "done"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_res.status_code == 200, patch_res.text

    delete_res = await client.delete(
        f"/api/v1/employee/tasks/{task_id}/documents/{document_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_res.status_code == 409


@pytest.mark.asyncio
async def test_cross_employee_list_is_404(client: AsyncClient) -> None:
    auth_a, staff_a = await _seed_employee("loans")
    _, staff_b = await _seed_employee("loans")
    task_b = await _seed_task("loans", staff_b)
    token_a = _employee_token(auth_a, staff_a)

    res = await client.get(
        f"/api/v1/employee/tasks/{task_b}/documents",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 404
