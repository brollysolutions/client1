"""Purpose-bound private feedback media for assigned property-visit Employees."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.security import create_access_token
from app.models.task import TaskFeedbackMedia
from app.services import storage, task_feedback
from app.services.media_processing import ScannerUnavailable
from conftest import full_registration

from .test_admin_tasks import _auth_user_uuid
from .test_employee_task_documents import _employee_token, _seed_employee, _seed_task

pytestmark = pytest.mark.asyncio


def _admin_token(auth_user_uuid: str) -> str:
    return create_access_token(
        {
            "sub": auth_user_uuid,
            "role": "admin",
            "business_line": "",
            "platform_scope": "true",
        }
    )


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _managed_uploads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(storage, "head_object", lambda _key: 2048)
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: True)
    monkeypatch.setattr(
        task_feedback,
        "canonicalize_object",
        lambda _source, _destination, _content_type, *, max_bytes: 1536,
    )
    monkeypatch.setattr(storage, "delete_object", lambda _key: None)


async def _presign(client: AsyncClient, token: str, task_id: str) -> dict:
    response = await client.post(
        f"/api/v1/employee/tasks/{task_id}/feedback-media/presign",
        headers=_headers(token),
        json={"content_type": "image/jpeg"},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_assigned_employee_can_confirm_list_delete_and_admin_can_read(
    client: AsyncClient,
) -> None:
    employee_auth, employee_profile = await _seed_employee("real_estate")
    task_id = await _seed_task(
        "real_estate", employee_profile, task_type="property_visit", status="assigned"
    )
    token = _employee_token(employee_auth, employee_profile, "real_estate")
    presign = await _presign(client, token, task_id)
    assert presign["max_bytes"] == 5 * 1024 * 1024
    assert presign["object_key"].startswith(
        f"private/task-feedback/staging/{employee_auth}/{task_id}/"
    )

    confirmed = await client.post(
        f"/api/v1/employee/tasks/{task_id}/feedback-media",
        headers=_headers(token),
        json={
            "content_type": "image/jpeg",
            "object_key": presign["object_key"],
        },
    )
    assert confirmed.status_code == 201, confirmed.text
    assert confirmed.headers["cache-control"] == "private, no-store"
    item = confirmed.json()
    assert item["kind"] == "image"
    assert item["size_bytes"] == 1536
    assert item["preview_url"].startswith("http")
    assert item["download_url"].startswith("http")

    own_list = await client.get(
        f"/api/v1/employee/tasks/{task_id}/feedback-media", headers=_headers(token)
    )
    assert own_list.status_code == 200, own_list.text
    assert [entry["id"] for entry in own_list.json()] == [item["id"]]

    _, admin_mobile = await full_registration(client)
    admin_auth = await _auth_user_uuid(admin_mobile)
    admin_list = await client.get(
        f"/api/v1/admin/tasks/{task_id}/feedback-media",
        headers=_headers(_admin_token(admin_auth)),
    )
    assert admin_list.status_code == 200, admin_list.text
    assert [entry["id"] for entry in admin_list.json()] == [item["id"]]

    deleted = await client.delete(
        f"/api/v1/employee/tasks/{task_id}/feedback-media/{item['id']}",
        headers=_headers(token),
    )
    assert deleted.status_code == 204, deleted.text


async def test_feedback_is_rejected_for_wrong_purpose_and_closed_tasks(
    client: AsyncClient,
) -> None:
    employee_auth, employee_profile = await _seed_employee("real_estate")
    token = _employee_token(employee_auth, employee_profile, "real_estate")
    wrong_task = await _seed_task(
        "real_estate", employee_profile, task_type="document_collection", status="assigned"
    )
    closed_task = await _seed_task(
        "real_estate", employee_profile, task_type="property_visit", status="completed"
    )

    wrong = await client.post(
        f"/api/v1/employee/tasks/{wrong_task}/feedback-media/presign",
        headers=_headers(token),
        json={"content_type": "image/jpeg"},
    )
    closed = await client.post(
        f"/api/v1/employee/tasks/{closed_task}/feedback-media/presign",
        headers=_headers(token),
        json={"content_type": "image/jpeg"},
    )
    assert wrong.status_code == 409, wrong.text
    assert closed.status_code == 409, closed.text


async def test_unassigned_employee_cannot_list_feedback(client: AsyncClient) -> None:
    owner_auth, owner_profile = await _seed_employee("real_estate")
    other_auth, other_profile = await _seed_employee("real_estate")
    task_id = await _seed_task(
        "real_estate", owner_profile, task_type="property_visit", status="assigned"
    )
    response = await client.get(
        f"/api/v1/employee/tasks/{task_id}/feedback-media",
        headers=_headers(_employee_token(other_auth, other_profile, "real_estate")),
    )
    assert response.status_code == 404, response.text


async def test_sixth_feedback_attachment_is_rejected(client: AsyncClient) -> None:
    employee_auth, employee_profile = await _seed_employee("real_estate")
    task_id = await _seed_task(
        "real_estate", employee_profile, task_type="property_visit", status="assigned"
    )
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as session:
        session.add_all(
            TaskFeedbackMedia(
                id=uuid.uuid4(),
                task_uuid=uuid.UUID(task_id),
                business_line="real_estate",
                kind="image",
                content_type="image/jpeg",
                object_key=f"private/task-feedback/canonical/{task_id}/{index}/asset.jpg",
                size_bytes=1024,
                uploaded_by_uuid=uuid.UUID(employee_auth),
                sanitized_at=datetime.now(UTC),
            )
            for index in range(settings.TASK_FEEDBACK_MAX_PER_TASK)
        )
        await session.commit()

    token = _employee_token(employee_auth, employee_profile, "real_estate")
    presign = await _presign(client, token, task_id)
    response = await client.post(
        f"/api/v1/employee/tasks/{task_id}/feedback-media",
        headers=_headers(token),
        json={"content_type": "image/jpeg", "object_key": presign["object_key"]},
    )
    assert response.status_code == 409, response.text


async def test_scanner_outage_fails_closed_without_destroying_staging_upload(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    employee_auth, employee_profile = await _seed_employee("real_estate")
    task_id = await _seed_task(
        "real_estate", employee_profile, task_type="property_visit", status="assigned"
    )
    token = _employee_token(employee_auth, employee_profile, "real_estate")
    presign = await _presign(client, token, task_id)
    deleted: list[str] = []

    def scanner_unavailable(*_args, **_kwargs):
        raise ScannerUnavailable

    monkeypatch.setattr(task_feedback, "canonicalize_object", scanner_unavailable)
    monkeypatch.setattr(storage, "delete_object", deleted.append)
    response = await client.post(
        f"/api/v1/employee/tasks/{task_id}/feedback-media",
        headers=_headers(token),
        json={"content_type": "image/jpeg", "object_key": presign["object_key"]},
    )

    assert response.status_code == 502, response.text
    assert presign["object_key"] not in deleted
    assert deleted == [
        presign["object_key"]
        .replace("/staging/", "/canonical/")
        .replace(f"/{employee_auth}/{task_id}/", f"/{task_id}/")
    ]
