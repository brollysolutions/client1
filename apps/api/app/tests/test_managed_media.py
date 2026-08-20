"""Bounded managed-video worker behavior independent of FFmpeg binaries."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.models.loan_document import LoanDocument
from app.models.task import TaskFeedbackMedia
from app.services import managed_media, storage
from app.services.media_processing import ScannerUnavailable

from .test_employee_task_documents import _seed_employee, _seed_task

pytestmark = pytest.mark.asyncio


async def test_batch_processes_only_loan_video_work(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[type] = []

    async def process_one(model: type, *, max_duration_seconds: int) -> bool:
        assert max_duration_seconds > 0
        calls.append(model)
        return True

    monkeypatch.setattr(managed_media, "_process_one", process_one)

    assert await managed_media.process_pending_media(batch_size=4) == {"processed": 4}
    assert calls == [LoanDocument, LoanDocument, LoanDocument, LoanDocument]


async def test_scanner_outage_requeues_and_removes_partial_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def claim_one(_model: type):
        return managed_media.UUID("00000000-0000-0000-0000-000000000001"), "private/x/upload.mp4"

    finishes: list[dict] = []

    async def finish(*_args, **kwargs) -> bool:
        finishes.append(kwargs)
        return True

    def unavailable(*_args, **_kwargs):
        raise ScannerUnavailable

    deleted: list[str] = []
    monkeypatch.setattr(managed_media, "_claim_one", claim_one)
    monkeypatch.setattr(managed_media, "_finish", finish)
    monkeypatch.setattr(managed_media, "process_video_object", unavailable)
    monkeypatch.setattr(storage, "delete_object", deleted.append)

    assert await managed_media._process_one(LoanDocument, max_duration_seconds=120)
    assert finishes == [{"retry": True}]
    assert deleted == ["private/x/asset.mp4"]


async def test_retention_deletes_terminal_feedback_and_old_unreferenced_objects(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    del client
    employee_auth, employee_profile = await _seed_employee("real_estate")
    task_id = await _seed_task(
        "real_estate", employee_profile, task_type="property_visit", status="assigned"
    )
    media_id = uuid.uuid4()
    referenced_key = f"private/task-feedback/canonical/{task_id}/{media_id}/asset.jpg"
    old_orphan = f"private/task-feedback/staging/{employee_auth}/{task_id}/{uuid.uuid4()}/asset.jpg"
    fresh_orphan = (
        f"private/task-feedback/staging/{employee_auth}/{task_id}/{uuid.uuid4()}/asset.jpg"
    )
    old = datetime.now(UTC) - timedelta(days=91)

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as session:
        await session.execute(
            text("UPDATE tasks SET status = 'completed', updated_at = :old WHERE id = :task_id"),
            {"old": old, "task_id": task_id},
        )
        session.add(
            TaskFeedbackMedia(
                id=media_id,
                task_uuid=uuid.UUID(task_id),
                business_line="real_estate",
                kind="image",
                content_type="image/jpeg",
                object_key=referenced_key,
                size_bytes=1024,
                uploaded_by_uuid=uuid.UUID(employee_auth),
                sanitized_at=old,
            )
        )
        await session.commit()

    monkeypatch.setattr(
        storage,
        "list_objects",
        lambda _prefix: [
            {"key": referenced_key, "last_modified": old},
            {"key": old_orphan, "last_modified": old},
            {"key": fresh_orphan, "last_modified": datetime.now(UTC)},
        ],
    )
    deleted: list[str] = []
    monkeypatch.setattr(storage, "delete_object", deleted.append)

    summary = await managed_media.purge_expired_private_media()

    assert summary == {"deleted_rows": 1, "deleted_objects": 2}
    assert set(deleted) == {referenced_key, old_orphan}
    async with session_module.AsyncSessionLocal() as session:
        assert (
            await session.scalar(
                select(TaskFeedbackMedia.id).where(TaskFeedbackMedia.id == media_id)
            )
            is None
        )
