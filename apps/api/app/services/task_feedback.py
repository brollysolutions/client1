"""Private managed feedback media for assigned real-estate property visits."""

from __future__ import annotations

import asyncio
import uuid
from contextlib import suppress
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import (
    TTL_TASK_FEEDBACK_MEDIA_PRESIGN,
    RedisCache,
    task_feedback_media_presign_key,
)
from app.core.config import settings
from app.models.task import Task, TaskFeedbackMedia, TaskStatus, TaskType
from app.services import storage
from app.services.media_processing import (
    MalwareDetected,
    MediaProcessingError,
    ScannerUnavailable,
    canonicalize_object,
)

_STAGING_PREFIX = "private/task-feedback/staging/"
_CANONICAL_PREFIX = "private/task-feedback/canonical/"
_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}
_WRITABLE_STATUSES = {TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED}
_PRESIGN_LIMIT_PER_HOUR = 15


class TaskFeedbackError(Exception):
    pass


class WrongTaskPurpose(TaskFeedbackError):
    pass


class TaskNotWritable(TaskFeedbackError):
    pass


class FeedbackLimitReached(TaskFeedbackError):
    pass


class FeedbackRateExceeded(TaskFeedbackError):
    pass


class FeedbackKeyMismatch(TaskFeedbackError):
    pass


class FeedbackUploadInvalid(TaskFeedbackError):
    pass


class FeedbackStorageUnavailable(TaskFeedbackError):
    pass


def _check_task(task: Task) -> None:
    if task.task_type != TaskType.PROPERTY_VISIT or task.business_line != "real_estate":
        raise WrongTaskPurpose
    if task.status not in _WRITABLE_STATUSES:
        raise TaskNotWritable


async def presign_feedback_upload(
    cache: RedisCache,
    task: Task,
    *,
    owner_uuid: UUID,
    content_type: str,
) -> tuple[str, str, dict[str, str], int]:
    _check_task(task)
    count = await cache.incr_with_expire(
        task_feedback_media_presign_key(str(owner_uuid)),
        TTL_TASK_FEEDBACK_MEDIA_PRESIGN,
    )
    if count > _PRESIGN_LIMIT_PER_HOUR:
        raise FeedbackRateExceeded
    media_id = uuid.uuid4()
    key = f"{_STAGING_PREFIX}{owner_uuid}/{task.id}/{media_id}/asset{_EXTENSIONS[content_type]}"
    url, fields = storage.presign_upload_post(
        key,
        content_type,
        max_bytes=settings.TASK_FEEDBACK_MAX_UPLOAD_BYTES,
    )
    return key, url, fields, settings.TASK_FEEDBACK_MAX_UPLOAD_BYTES


def _media_id_from_key(key: str, owner_uuid: UUID, task: Task, content_type: str) -> UUID:
    prefix = f"{_STAGING_PREFIX}{owner_uuid}/{task.id}/"
    suffix = f"/asset{_EXTENSIONS[content_type]}"
    if not key.startswith(prefix) or not key.endswith(suffix):
        raise FeedbackKeyMismatch
    value = key.removeprefix(prefix).removesuffix(suffix)
    try:
        return UUID(value)
    except ValueError as exc:
        raise FeedbackKeyMismatch from exc


async def _delete_object(key: str) -> None:
    with suppress(Exception):
        await asyncio.to_thread(storage.delete_object, key)


async def create_feedback_media(
    db: AsyncSession,
    task: Task,
    *,
    owner_uuid: UUID,
    content_type: str,
    object_key: str,
) -> TaskFeedbackMedia:
    _check_task(task)
    media_id = _media_id_from_key(object_key, owner_uuid, task, content_type)
    locked_task = await db.scalar(select(Task).where(Task.id == task.id).with_for_update())
    if locked_task is None:
        raise FeedbackKeyMismatch
    _check_task(locked_task)
    count = await db.scalar(
        select(func.count())
        .select_from(TaskFeedbackMedia)
        .where(TaskFeedbackMedia.task_uuid == task.id)
    )
    if (count or 0) >= settings.TASK_FEEDBACK_MAX_PER_TASK:
        raise FeedbackLimitReached
    canonical_key = f"{_CANONICAL_PREFIX}{task.id}/{media_id}/asset{_EXTENSIONS[content_type]}"
    try:
        size = await asyncio.to_thread(storage.head_object, object_key)
        if size is None or not 1 <= size <= settings.TASK_FEEDBACK_MAX_UPLOAD_BYTES:
            raise FeedbackUploadInvalid
        if not await asyncio.to_thread(
            storage.content_matches_declared_type, object_key, content_type
        ):
            raise FeedbackUploadInvalid
        size = await asyncio.to_thread(
            canonicalize_object,
            object_key,
            canonical_key,
            content_type,
            max_bytes=settings.TASK_FEEDBACK_MAX_UPLOAD_BYTES,
        )
    except ScannerUnavailable as exc:
        await _delete_object(canonical_key)
        raise FeedbackStorageUnavailable from exc
    except (MalwareDetected, MediaProcessingError, FeedbackUploadInvalid) as exc:
        await _delete_object(object_key)
        await _delete_object(canonical_key)
        raise FeedbackUploadInvalid from exc
    except Exception as exc:
        await _delete_object(canonical_key)
        raise FeedbackStorageUnavailable from exc

    item = TaskFeedbackMedia(
        id=media_id,
        task_uuid=task.id,
        business_line="real_estate",
        kind="document" if content_type == "application/pdf" else "image",
        content_type=content_type,
        object_key=canonical_key,
        size_bytes=size,
        uploaded_by_uuid=owner_uuid,
        sanitized_at=datetime.now(UTC),
    )
    db.add(item)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        await _delete_object(canonical_key)
        raise FeedbackKeyMismatch from exc
    except Exception:
        await db.rollback()
        await _delete_object(canonical_key)
        raise
    await db.refresh(item)
    await _delete_object(object_key)
    return item


async def list_feedback_media(db: AsyncSession, task_id: UUID) -> list[TaskFeedbackMedia]:
    return list(
        (
            await db.scalars(
                select(TaskFeedbackMedia)
                .where(TaskFeedbackMedia.task_uuid == task_id)
                .order_by(TaskFeedbackMedia.created_at.desc(), TaskFeedbackMedia.id)
            )
        ).all()
    )


async def delete_feedback_media(db: AsyncSession, task: Task, media_id: UUID) -> None:
    _check_task(task)
    item = await db.scalar(
        select(TaskFeedbackMedia).where(
            TaskFeedbackMedia.id == media_id,
            TaskFeedbackMedia.task_uuid == task.id,
        )
    )
    if item is None:
        raise FeedbackKeyMismatch
    key = item.object_key
    await db.delete(item)
    await db.commit()
    await _delete_object(key)
