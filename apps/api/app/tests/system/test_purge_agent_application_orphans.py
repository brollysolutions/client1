"""Orphan-purge job tests (docs/specs/agent-application-intake.md).

purge_orphaned_uploads must delete only objects that are BOTH old enough
(clear of the 15-min ticket TTL, so an in-flight submit is never touched) AND
unreferenced by any AgentApplication row — abandoned uploads and objects
superseded by a re-apply upsert. A referenced object must survive regardless
of age; a fresh object must survive regardless of reference. Idempotent: a
second run with nothing new to do deletes nothing.

Requires the Docker stack; auto-skips without Redis (via the shared `client`
fixture import).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.services import agent_applications, storage
from conftest import unique_mobile

_OLD = datetime.now(UTC) - timedelta(hours=72)
_FRESH = datetime.now(UTC) - timedelta(minutes=5)


async def _seed_application_with_photo_ref(photo_ref: str) -> None:
    import app.db.session as _session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            AgentApplication(
                first_name="Ravi",
                last_name="Kumar",
                mobile=unique_mobile(),
                business_line="loans",
                photo_ref=photo_ref,
                status=SubmissionStatus.PENDING,
            )
        )
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
        _fake_objects([{"key": "agent-applications/x/abandoned-photo", "last_modified": _OLD}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    summary = await agent_applications.purge_orphaned_uploads()
    assert summary == {"scanned": 1, "deleted": 1}
    assert deleted_keys == ["agent-applications/x/abandoned-photo"]


@pytest.mark.asyncio
async def test_keeps_old_referenced_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    key = "agent-applications/y/kept-photo"
    await _seed_application_with_photo_ref(key)
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage, "list_objects", _fake_objects([{"key": key, "last_modified": _OLD}])
    )
    monkeypatch.setattr(storage, "delete_object", lambda k: deleted_keys.append(k))

    summary = await agent_applications.purge_orphaned_uploads()
    assert summary["deleted"] == 0
    assert deleted_keys == []


@pytest.mark.asyncio
async def test_keeps_fresh_unreferenced_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An in-flight submit (well within the 15-min ticket TTL) must never be
    swept, referenced or not."""
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "agent-applications/z/in-flight-photo", "last_modified": _FRESH}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    summary = await agent_applications.purge_orphaned_uploads()
    assert summary["deleted"] == 0
    assert deleted_keys == []


@pytest.mark.asyncio
async def test_purge_is_idempotent(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "agent-applications/w/abandoned-pan", "last_modified": _OLD}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    first = await agent_applications.purge_orphaned_uploads()
    assert first["deleted"] == 1

    # Second run: the object is gone from storage, so list_objects returns
    # nothing — mirrors what a real second sweep would see.
    monkeypatch.setattr(storage, "list_objects", _fake_objects([]))
    second = await agent_applications.purge_orphaned_uploads()
    assert second == {"scanned": 0, "deleted": 0}
