"""Idempotent scheduler processing and lifecycle cleanup for managed media."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select

import app.db.session as db_session
from app.core.config import settings
from app.models.loan import LoanApplication
from app.models.loan_document import LoanDocument
from app.models.property_media import MediaProcessingStatus, PropertySubmissionMedia
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.models.task import Task, TaskFeedbackMedia, TaskStatus
from app.services import storage
from app.services.media_processing import (
    CanonicalOutputTooLarge,
    InvalidVideo,
    MalwareDetected,
    MediaProcessingError,
    ScannerUnavailable,
    VideoDurationExceeded,
    VideoPolicy,
    process_video_object,
)

logger = logging.getLogger(__name__)
_STALE_PROCESSING_AFTER = timedelta(minutes=10)
_ORPHAN_MIN_AGE = timedelta(hours=1)
_TASK_FEEDBACK_PREFIX = "private/task-feedback/"


def _failure_code(exc: MediaProcessingError) -> str:
    if isinstance(exc, MalwareDetected):
        return "malware_detected"
    if isinstance(exc, VideoDurationExceeded):
        return "duration_exceeded"
    if isinstance(exc, CanonicalOutputTooLarge):
        return "output_too_large"
    if isinstance(exc, InvalidVideo):
        return "invalid_video"
    return "processing_failed"


async def _claim_one(model: type[PropertySubmissionMedia] | type[LoanDocument]):
    now = datetime.now(UTC)
    stale = now - _STALE_PROCESSING_AFTER
    async with db_session.AsyncSessionLocal() as session:
        row = await session.scalar(
            select(model)
            .where(
                model.content_type == "video/mp4",
                or_(
                    model.processing_status == MediaProcessingStatus.PENDING,
                    (
                        (model.processing_status == MediaProcessingStatus.PROCESSING)
                        & (model.processing_started_at < stale)
                    ),
                ),
            )
            .order_by(model.created_at, model.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if row is None:
            return None
        row.processing_status = MediaProcessingStatus.PROCESSING
        row.processing_started_at = now
        row.processing_error_code = None
        claim = (row.id, row.object_key)
        await session.commit()
        return claim


async def _finish(
    model: type[PropertySubmissionMedia] | type[LoanDocument],
    media_id: UUID,
    source_key: str,
    *,
    destination_key: str | None = None,
    size_bytes: int | None = None,
    duration_seconds: int | None = None,
    error_code: str | None = None,
    retry: bool = False,
) -> bool:
    async with db_session.AsyncSessionLocal() as session:
        row = await session.get(model, media_id, with_for_update=True)
        if (
            row is None
            or row.object_key != source_key
            or row.processing_status != MediaProcessingStatus.PROCESSING
        ):
            return False
        now = datetime.now(UTC)
        if destination_key is not None:
            row.object_key = destination_key
            row.size_bytes = size_bytes
            row.duration_seconds = duration_seconds
            row.processing_status = MediaProcessingStatus.READY
            row.processing_error_code = None
            row.processed_at = now
            row.sanitized_at = now
        elif retry:
            row.processing_status = MediaProcessingStatus.PENDING
            row.processing_error_code = None
            row.processing_started_at = None
        else:
            row.processing_status = MediaProcessingStatus.FAILED
            row.processing_error_code = error_code or "processing_failed"
            row.processed_at = now
        await session.commit()
        return True


async def _process_one(
    model: type[PropertySubmissionMedia] | type[LoanDocument],
    *,
    max_duration_seconds: int,
) -> bool:
    claim = await _claim_one(model)
    if claim is None:
        return False
    media_id, source_key = claim
    destination_key = source_key.rsplit("/", 1)[0] + "/asset.mp4"
    try:
        result = await asyncio.to_thread(
            process_video_object,
            source_key,
            destination_key,
            policy=VideoPolicy(
                max_bytes=settings.MEDIA_VIDEO_MAX_UPLOAD_BYTES,
                max_duration_seconds=max_duration_seconds,
            ),
        )
    except ScannerUnavailable:
        try:
            await _finish(model, media_id, source_key, retry=True)
        finally:
            await asyncio.to_thread(storage.delete_object, destination_key)
        return True
    except MediaProcessingError as exc:
        try:
            await _finish(model, media_id, source_key, error_code=_failure_code(exc))
        finally:
            await asyncio.to_thread(storage.delete_object, destination_key)
        return True
    except Exception:
        logger.warning("managed_media.processing_unavailable", exc_info=True)
        try:
            await _finish(model, media_id, source_key, retry=True)
        finally:
            await asyncio.to_thread(storage.delete_object, destination_key)
        return True
    try:
        committed = await _finish(
            model,
            media_id,
            source_key,
            destination_key=destination_key,
            size_bytes=result.size_bytes,
            duration_seconds=result.duration_seconds,
        )
    except Exception:
        await asyncio.to_thread(storage.delete_object, destination_key)
        raise
    if committed:
        await asyncio.to_thread(storage.delete_object, source_key)
    else:
        await asyncio.to_thread(storage.delete_object, destination_key)
    return True


async def process_pending_media(*, batch_size: int = 4) -> dict[str, int]:
    processed = 0
    sources = ((LoanDocument, settings.LOAN_VIDEO_MAX_DURATION_SECONDS),)
    for index in range(batch_size):
        did_work = False
        for offset in range(len(sources)):
            model, duration = sources[(index + offset) % len(sources)]
            did_work = await _process_one(model, max_duration_seconds=duration)
            if did_work:
                break
        if not did_work:
            break
        processed += 1
    return {"processed": processed}


async def purge_expired_private_media() -> dict[str, int]:
    """Delete private media after the purpose-specific terminal retention window."""
    now = datetime.now(UTC)
    private_cutoff = now - timedelta(days=settings.MEDIA_PRIVATE_RETENTION_DAYS)
    failed_cutoff = now - timedelta(days=settings.MEDIA_FAILED_RETENTION_DAYS)
    terminal_task_statuses = {TaskStatus.COMPLETED, TaskStatus.CANCELLED}
    feedback_objects = await asyncio.to_thread(storage.list_objects, _TASK_FEEDBACK_PREFIX)
    orphan_cutoff = now - _ORPHAN_MIN_AGE
    object_keys: list[str] = []
    deleted_rows = 0
    async with db_session.AsyncSessionLocal() as session:
        referenced_feedback = set(
            (await session.scalars(select(TaskFeedbackMedia.object_key))).all()
        )
        object_keys.extend(
            item["key"]
            for item in feedback_objects
            if item["last_modified"] < orphan_cutoff and item["key"] not in referenced_feedback
        )
        failed_property = list(
            (
                await session.scalars(
                    select(PropertySubmissionMedia).where(
                        PropertySubmissionMedia.processing_status == MediaProcessingStatus.FAILED,
                        PropertySubmissionMedia.processed_at < failed_cutoff,
                    )
                )
            ).all()
        )
        approved_property_documents = list(
            (
                await session.scalars(
                    select(PropertySubmissionMedia)
                    .join(
                        PropertySubmission,
                        PropertySubmission.id == PropertySubmissionMedia.submission_uuid,
                    )
                    .where(
                        PropertySubmission.status == SubmissionStatus.APPROVED,
                        PropertySubmission.reviewed_at < private_cutoff,
                        PropertySubmissionMedia.kind == "document",
                    )
                )
            ).all()
        )
        failed_loans = list(
            (
                await session.scalars(
                    select(LoanDocument).where(
                        LoanDocument.processing_status == MediaProcessingStatus.FAILED,
                        LoanDocument.processed_at < failed_cutoff,
                    )
                )
            ).all()
        )
        terminal_loans = list(
            (
                await session.scalars(
                    select(LoanDocument)
                    .join(
                        LoanApplication,
                        LoanApplication.id == LoanDocument.loan_application_uuid,
                    )
                    .where(LoanApplication.closed_at < private_cutoff)
                )
            ).all()
        )
        terminal_feedback = list(
            (
                await session.scalars(
                    select(TaskFeedbackMedia)
                    .join(Task, Task.id == TaskFeedbackMedia.task_uuid)
                    .where(
                        Task.status.in_(terminal_task_statuses),
                        Task.updated_at < private_cutoff,
                    )
                )
            ).all()
        )
        candidate_rows = [
            *failed_property,
            *approved_property_documents,
            *failed_loans,
            *terminal_loans,
            *terminal_feedback,
        ]
        rows = list({(type(row), row.id): row for row in candidate_rows}.values())
        object_keys.extend(row.object_key for row in rows)
        for row in rows:
            await session.delete(row)
        deleted_rows = len(rows)
        await session.commit()
    object_keys = list(dict.fromkeys(object_keys))
    if object_keys:
        await asyncio.gather(
            *(asyncio.to_thread(storage.delete_object, key) for key in object_keys)
        )
    return {"deleted_rows": deleted_rows, "deleted_objects": len(object_keys)}
