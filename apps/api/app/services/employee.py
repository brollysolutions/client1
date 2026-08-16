"""Employee field-task surface — list/detail own assigned tasks, transition
status, record a background_check outcome, home summary.

Every function here runs on the request-scoped `db` session (Depends(get_db)):
tasks_rls already narrows an employee's queries to tasks assigned to them
(own-line + assigned_employee_profile_uuid = self). The explicit
`assigned_employee_profile_uuid` filters below are defense-in-depth, not the
only wall — same posture as services/telecaller.py.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.cache.redis_keys import (
    TTL_TASK_DOCUMENT_PRESIGN,
    TTL_TASK_DOCUMENT_UPLOAD,
    RedisCache,
    task_document_presign_key,
    task_document_upload_key,
)
from app.core.config import settings
from app.models.lead import Lead
from app.models.task import BgCheckOutcome, Task, TaskDocument, TaskStatus, TaskType
from app.schemas.employee import EmployeeTaskUpdate
from app.services import storage

_TASK_DOCUMENT_KEY_PREFIX = "tasks/"
# Well clear of the 300s presign TTL (services/storage.py::_PRESIGN_EXPIRE_SECONDS),
# so an in-flight upload is never mistaken for an orphan — same margin
# purge_loan_document_orphans / purge_agent_application_orphans use.
_ORPHAN_MIN_AGE = timedelta(hours=1)

_TERMINAL = {TaskStatus.COMPLETED, TaskStatus.CANCELLED}

# assigned -> blocked is allowed directly (a task can be blocked before work
# starts, e.g. the employee can't reach the address yet). 'unassigned' is
# excluded: tasks_rls never surfaces an unassigned task to an employee.
_ALLOWED_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.ASSIGNED: {TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED},
    TaskStatus.IN_PROGRESS: {TaskStatus.COMPLETED, TaskStatus.BLOCKED, TaskStatus.CANCELLED},
    TaskStatus.BLOCKED: {TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED},
}


class TaskAlreadyTerminal(Exception):
    """Raised when any field change is attempted on a completed/cancelled task."""


class IllegalTransition(Exception):
    """Raised when the requested status isn't reachable from the task's current status."""


class OutcomeNotApplicable(Exception):
    """Raised when outcome is set on a non-background_check task, or the
    resulting status isn't 'completed'."""


class OutcomeRequired(Exception):
    """Raised when completing a background_check task with no outcome
    (existing or provided in this update)."""


class TaskNotDocumentCollection(Exception):
    """Raised when a document-upload endpoint is called against a task whose
    task_type isn't document_collection."""


class TaskDocumentKeyMismatch(Exception):
    """Raised when confirm_document is called with an object_key that
    doesn't belong to this task's own key prefix — presign never hands out
    a key outside tasks/{task_id}/, so a mismatch means the caller is trying
    to attach an object from elsewhere (security review finding)."""


class TaskDocumentContentTypeUnrecognized(Exception):
    """The upload is absent, empty, oversize, or not an accepted document type."""


class TaskDocumentStorageUnavailable(Exception):
    """Storage was unreachable while verifying an upload. Fail closed."""


class TaskDocumentLimitReached(Exception):
    """The task already has the configured maximum confirmed documents."""


class TaskDocumentRateExceeded(Exception):
    """The Employee exhausted the bounded hourly presign allowance."""


def _base_stmt():
    return select(Task, Lead.name, Lead.mobile).join(Lead, Lead.id == Task.lead_uuid)


async def list_tasks_for_employee(
    db: AsyncSession,
    staff_profile_uuid: UUID,
    status_filter: str | None = None,
    task_type_filter: str | None = None,
) -> list[tuple[Task, str | None, str]]:
    stmt = _base_stmt().where(Task.assigned_employee_profile_uuid == staff_profile_uuid)
    if status_filter is not None:
        stmt = stmt.where(Task.status == TaskStatus(status_filter))
    if task_type_filter is not None:
        stmt = stmt.where(Task.task_type == TaskType(task_type_filter))
    stmt = stmt.order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc())
    rows = (await db.execute(stmt)).all()
    return [(row[0], row[1], row[2]) for row in rows]


async def get_task_for_employee(
    db: AsyncSession, task_id: UUID, staff_profile_uuid: UUID
) -> tuple[Task, str | None, str] | None:
    stmt = _base_stmt().where(
        Task.id == task_id, Task.assigned_employee_profile_uuid == staff_profile_uuid
    )
    row = (await db.execute(stmt)).first()
    return (row[0], row[1], row[2]) if row is not None else None


async def get_task_for_update(
    db: AsyncSession, task_id: UUID, staff_profile_uuid: UUID
) -> Task | None:
    """Row-locked fetch for the PATCH path — mirrors services/tasks.py's
    with_for_update on assign_task_to_employee. Prevents two concurrent PATCHes
    (double-tap, multi-tab) from both reading the same pre-update status and
    silently clobbering each other's state-machine/outcome writes."""
    stmt = (
        select(Task)
        .where(Task.id == task_id, Task.assigned_employee_profile_uuid == staff_profile_uuid)
        .with_for_update()
    )
    return await db.scalar(stmt)


async def update_task(db: AsyncSession, task: Task, payload: EmployeeTaskUpdate) -> Task:
    if task.status in _TERMINAL and (
        payload.status is not None or payload.notes is not None or payload.outcome is not None
    ):
        raise TaskAlreadyTerminal

    next_status = TaskStatus(payload.status) if payload.status is not None else task.status
    if (
        payload.status is not None
        and next_status != task.status
        and next_status not in _ALLOWED_TRANSITIONS.get(task.status, set())
    ):
        raise IllegalTransition

    if payload.outcome is not None and (
        task.task_type != TaskType.BACKGROUND_CHECK or next_status != TaskStatus.COMPLETED
    ):
        raise OutcomeNotApplicable

    if (
        task.task_type == TaskType.BACKGROUND_CHECK
        and next_status == TaskStatus.COMPLETED
        and task.outcome is None
        and payload.outcome is None
    ):
        raise OutcomeRequired

    if payload.status is not None:
        task.status = next_status
    if payload.notes is not None:
        task.notes = payload.notes
    if payload.outcome is not None:
        task.outcome = BgCheckOutcome(payload.outcome)

    await db.commit()
    await db.refresh(task)
    return task


async def get_home_summary(
    db: AsyncSession, staff_profile_uuid: UUID
) -> tuple[list[tuple[Task, str | None, str]], int, dict[str, int], dict[str, int]]:
    """Returns (tasks_today, overdue_count, counts_by_type, counts_by_status),
    computed in Python over the employee's full task list — same posture as
    telecaller's get_home_summary (small per-employee scale, no SQL
    aggregation needed)."""
    rows = await list_tasks_for_employee(db, staff_profile_uuid)
    now = datetime.now(UTC)
    today = now.date()
    counts_by_type: dict[str, int] = {}
    counts_by_status: dict[str, int] = {}
    tasks_today: list[tuple[Task, str | None, str]] = []
    overdue_count = 0
    for task, name, mobile in rows:
        counts_by_type[task.task_type.value] = counts_by_type.get(task.task_type.value, 0) + 1
        counts_by_status[task.status.value] = counts_by_status.get(task.status.value, 0) + 1
        if task.status in _TERMINAL or task.due_at is None:
            continue
        due = task.due_at if task.due_at.tzinfo else task.due_at.replace(tzinfo=UTC)
        if due < now:
            overdue_count += 1
        if due.date() == today:
            tasks_today.append((task, name, mobile))
    tasks_today.sort(key=lambda row: row[0].due_at)
    return tasks_today, overdue_count, counts_by_type, counts_by_status


def _check_document_writable(task: Task) -> None:
    """Shared guard for presign/create/delete: only a document_collection
    task, not yet terminal, accepts document writes."""
    if task.task_type != TaskType.DOCUMENT_COLLECTION:
        raise TaskNotDocumentCollection
    if task.status in _TERMINAL:
        raise TaskAlreadyTerminal


def build_document_object_key(task_id: UUID, doc_type: str) -> str:
    return f"{_document_key_prefix(task_id)}{uuid.uuid4()}-{doc_type}"


async def presign_task_document_upload(
    cache: RedisCache,
    task: Task,
    *,
    owner_uuid: UUID,
    doc_type: str,
    content_type: str,
) -> tuple[str, str, dict[str, str], int]:
    """Return an object key and storage-enforced multipart upload policy."""
    _check_document_writable(task)
    count = await cache.incr_with_expire(
        task_document_presign_key(str(owner_uuid)), TTL_TASK_DOCUMENT_PRESIGN
    )
    if count > settings.TASK_DOCUMENT_PRESIGN_LIMIT_PER_HOUR:
        raise TaskDocumentRateExceeded
    object_key = build_document_object_key(task.id, doc_type)
    upload_url, fields = storage.presign_upload_post(
        object_key,
        content_type,
        max_bytes=settings.TASK_DOCUMENT_MAX_UPLOAD_BYTES,
    )
    await cache.set(
        task_document_upload_key(object_key),
        json.dumps(
            {
                "owner_uuid": str(owner_uuid),
                "task_uuid": str(task.id),
                "doc_type": doc_type,
                "content_type": content_type,
            },
            separators=(",", ":"),
        ),
        TTL_TASK_DOCUMENT_UPLOAD,
    )
    return object_key, upload_url, fields, settings.TASK_DOCUMENT_MAX_UPLOAD_BYTES


def _document_key_prefix(task_id: UUID) -> str:
    return f"tasks/{task_id}/"


async def create_task_document(
    db: AsyncSession,
    cache: RedisCache,
    task: Task,
    *,
    owner_uuid: UUID,
    doc_type: str,
    object_key: str,
) -> TaskDocument:
    _check_document_writable(task)
    if not object_key.startswith(_document_key_prefix(task.id)):
        raise TaskDocumentKeyMismatch
    raw_claim = await cache.getdel(task_document_upload_key(object_key))
    try:
        claim = json.loads(raw_claim) if raw_claim is not None else None
    except (TypeError, ValueError):
        claim = None
    if (
        not isinstance(claim, dict)
        or set(claim) != {"owner_uuid", "task_uuid", "doc_type", "content_type"}
        or claim["owner_uuid"] != str(owner_uuid)
        or claim["task_uuid"] != str(task.id)
        or claim["doc_type"] != doc_type
        or claim["content_type"] not in {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    ):
        raise TaskDocumentKeyMismatch
    content_type = claim["content_type"]
    # Serialize mutable task state and the per-task count. Concurrent confirms
    # cannot both observe the final available quota slot.
    locked_task = await db.scalar(
        select(Task)
        .where(Task.id == task.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked_task is None:
        raise TaskDocumentKeyMismatch
    _check_document_writable(locked_task)
    count = await db.scalar(
        select(func.count()).select_from(TaskDocument).where(TaskDocument.task_uuid == task.id)
    )
    if (count or 0) >= settings.TASK_DOCUMENT_MAX_PER_TASK:
        await asyncio.to_thread(storage.delete_object, object_key)
        raise TaskDocumentLimitReached
    canonical_key = f"{_document_key_prefix(task.id)}confirmed/{uuid.uuid4()}-{doc_type}"
    try:
        content = await asyncio.to_thread(
            storage.read_object_bytes,
            object_key,
            max_bytes=settings.TASK_DOCUMENT_MAX_UPLOAD_BYTES,
        )
        if content is None or storage.sniff_content_type(content[:32]) != content_type:
            raise TaskDocumentContentTypeUnrecognized
        await asyncio.to_thread(storage.put_object_bytes, canonical_key, content, content_type)
    except TaskDocumentContentTypeUnrecognized:
        await asyncio.to_thread(storage.delete_object, object_key)
        raise
    except Exception as exc:  # transport failure — fail closed, don't swallow
        await asyncio.to_thread(storage.delete_object, canonical_key)
        await asyncio.to_thread(storage.delete_object, object_key)
        raise TaskDocumentStorageUnavailable from exc

    document = TaskDocument(task_uuid=task.id, doc_type=doc_type, object_key=canonical_key)
    db.add(document)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await asyncio.to_thread(storage.delete_object, canonical_key)
        await asyncio.to_thread(storage.delete_object, object_key)
        raise
    await db.refresh(document)
    await asyncio.to_thread(storage.delete_object, object_key)
    return document


async def list_task_documents(
    db: AsyncSession, task_id: UUID, staff_profile_uuid: UUID
) -> list[TaskDocument]:
    """App-layer own-task check mirrors get_task_for_employee — RLS is the
    real wall, this is defense in depth (same posture as every other query
    in this module)."""
    stmt = (
        select(TaskDocument)
        .join(Task, Task.id == TaskDocument.task_uuid)
        .where(
            TaskDocument.task_uuid == task_id,
            Task.assigned_employee_profile_uuid == staff_profile_uuid,
        )
        .order_by(TaskDocument.uploaded_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def get_task_document_for_delete(
    db: AsyncSession, task: Task, document_id: UUID
) -> TaskDocument | None:
    _check_document_writable(task)
    stmt = select(TaskDocument).where(
        TaskDocument.id == document_id, TaskDocument.task_uuid == task.id
    )
    return await db.scalar(stmt)


async def delete_task_document(db: AsyncSession, document: TaskDocument) -> None:
    object_key = document.object_key
    await db.delete(document)
    await db.commit()
    storage.delete_object(object_key)


async def purge_orphaned_task_documents(*, min_age: timedelta = _ORPHAN_MIN_AGE) -> dict[str, int]:
    """Delete objects under tasks/ that no TaskDocument row references.

    presign_task_document_upload hands out a signed POST before any
    TaskDocument row exists (create_task_document only writes the canonical
    row once the client confirms the upload succeeded). An abandoned staging
    upload therefore leaves an object nothing points at. Mirrors
    services/loan_documents.py::purge_orphaned_uploads and
    services/agent_applications.py's orphan sweep exactly; this was the one
    upload prefix in the codebase without an equivalent job
    (feature-status.md §2)."""
    cutoff = datetime.now(UTC) - min_age
    objects = storage.list_objects(_TASK_DOCUMENT_KEY_PREFIX)
    candidates = [o for o in objects if o["last_modified"] < cutoff]
    if not candidates:
        return {"scanned": len(objects), "deleted": 0}

    async with db_session.AsyncSessionLocal() as session:
        referenced = set((await session.scalars(select(TaskDocument.object_key))).all())

    deleted = 0
    for obj in candidates:
        if obj["key"] not in referenced:
            storage.delete_object(obj["key"])
            deleted += 1
    return {"scanned": len(objects), "deleted": deleted}
