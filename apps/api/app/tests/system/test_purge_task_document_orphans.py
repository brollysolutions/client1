"""Orphan-purge job tests for employee task documents (feature-status.md §2-19).

purge_orphaned_task_documents must delete only objects that are BOTH old
enough (clear of the 300s presign TTL, so an in-flight upload is never
touched) AND unreferenced by any TaskDocument row. A referenced object must
survive regardless of age; a fresh object must survive regardless of
reference. Idempotent: a second run with nothing new to do deletes nothing.
Mirrors test_purge_agent_application_orphans.py exactly.

Requires the Docker stack; auto-skips without Redis (via the shared `client`
fixture import).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.services import employee, storage
from conftest import unique_mobile

_OLD = datetime.now(UTC) - timedelta(hours=72)
_FRESH = datetime.now(UTC) - timedelta(minutes=5)


async def _seed_task() -> str:
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
            business_line="loans",
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(raiser_profile)
        await db.flush()

        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=raiser_profile.id,
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=raiser_profile.id,
            business_line="loans",
            task_type=TaskType.DOCUMENT_COLLECTION,
            lead_uuid=lead.id,
            status=TaskStatus.ASSIGNED,
        )
        db.add(task)
        await db.commit()
        return str(task.id)


async def _seed_task_document(task_id: str, object_key: str) -> None:
    import app.db.session as _session_mod
    from app.models.task import TaskDocument

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(TaskDocument(task_uuid=uuid.UUID(task_id), doc_type="other", object_key=object_key))
        await db.commit()


def _fake_objects(objects: list[dict]):
    return lambda _prefix: objects


@pytest.mark.asyncio
async def test_deletes_old_unreferenced_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "tasks/x/abandoned-doc", "last_modified": _OLD}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    summary = await employee.purge_orphaned_task_documents()
    assert summary == {"scanned": 1, "deleted": 1}
    assert deleted_keys == ["tasks/x/abandoned-doc"]


@pytest.mark.asyncio
async def test_keeps_old_referenced_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    task_id = await _seed_task()
    key = f"tasks/{task_id}/kept-doc"
    await _seed_task_document(task_id, key)
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage, "list_objects", _fake_objects([{"key": key, "last_modified": _OLD}])
    )
    monkeypatch.setattr(storage, "delete_object", lambda k: deleted_keys.append(k))

    summary = await employee.purge_orphaned_task_documents()
    assert summary["deleted"] == 0
    assert deleted_keys == []


@pytest.mark.asyncio
async def test_keeps_fresh_unreferenced_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An in-flight upload (well within the 300s presign TTL) must never be
    swept, referenced or not."""
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "tasks/z/in-flight-doc", "last_modified": _FRESH}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    summary = await employee.purge_orphaned_task_documents()
    assert summary["deleted"] == 0
    assert deleted_keys == []


@pytest.mark.asyncio
async def test_purge_is_idempotent(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "tasks/w/abandoned-doc", "last_modified": _OLD}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    first = await employee.purge_orphaned_task_documents()
    assert first["deleted"] == 1

    # Second run: the object is gone from storage, so list_objects returns
    # nothing — mirrors what a real second sweep would see.
    monkeypatch.setattr(storage, "list_objects", _fake_objects([]))
    second = await employee.purge_orphaned_task_documents()
    assert second == {"scanned": 0, "deleted": 0}
