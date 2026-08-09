"""Submission review — approve/reject on a bypass superuser session.

Runs on its OWN AsyncSessionLocal session as the 'app' superuser (bypasses RLS),
the same mechanism as services.notifications.emit_notification. Approval creates a
live Property from the submission payload AND flips the submission to `approved`
in one transaction, so the catalog's SELECT-only api_user grant is untouched and
the mutation never rides the reviewer's request transaction. Access control is the
router's platform-Admin guard (RLS wouldn't gate a superuser session).
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import (
    TTL_PROPERTY_MEDIA_PRESIGN,
    RedisCache,
    property_media_presign_key,
)
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.audit_log import AuditAction
from app.models.property import Property
from app.models.property_media import (
    MediaProcessingStatus,
    PropertyMedia,
    PropertySubmissionMedia,
)
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.schemas.property_submissions import SubmissionCreate, SubmissionMediaInput
from app.services import storage
from app.services.audit_log import record as record_audit
from app.services.media_processing import (
    MalwareDetected,
    MediaProcessingError,
    ScannerUnavailable,
    canonicalize_object,
)

IMAGE_MAX_BYTES = 5 * 1024 * 1024
DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
PRESIGN_LIMIT_PER_HOUR = 36
_PRIVATE_PREFIX = "private/property-submissions/"
_STAGING_PREFIX = f"{_PRIVATE_PREFIX}staging/"
_CANONICAL_PREFIX = f"{_PRIVATE_PREFIX}canonical/"
_PUBLIC_PREFIX = "public/properties/"
_MEDIA_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "video/mp4": ".mp4",
}


class SubmissionAlreadyReviewed(Exception):
    """Raised when approve/reject targets a row that is no longer pending."""


class MediaUploadRateExceeded(Exception):
    """Raised when one account requests too many property-media presigns."""


class MediaObjectKeyMismatch(Exception):
    """Raised when an object key was not issued for the authenticated owner."""


class MediaUploadMissing(Exception):
    """Raised when a claimed upload does not exist or exceeds its signed cap."""


class MediaContentMismatch(Exception):
    """Raised when uploaded bytes do not match the declared content type."""


class MediaStorageUnavailable(Exception):
    """Raised when storage cannot be verified or promoted; callers fail closed."""


class MediaObjectChanged(Exception):
    """Raised when submitted bytes no longer match their verified metadata."""


class MediaNotReady(Exception):
    """Raised when asynchronous processing has not produced safe canonical bytes."""


def _max_bytes(content_type: str) -> int:
    if content_type == "video/mp4":
        return settings.MEDIA_VIDEO_MAX_UPLOAD_BYTES
    return DOCUMENT_MAX_BYTES if content_type == "application/pdf" else IMAGE_MAX_BYTES


def build_media_key(owner_uuid: UUID, content_type: str) -> str:
    """Mint an opaque staging key; user filenames never reach storage or logs."""
    return f"{_STAGING_PREFIX}{owner_uuid}/{uuid.uuid4()}/asset{_MEDIA_EXTENSION[content_type]}"


async def _delete_objects(object_keys: list[str]) -> None:
    await asyncio.gather(
        *(asyncio.to_thread(storage.delete_object, object_key) for object_key in object_keys)
    )


async def verify_stored_media(asset: PropertySubmissionMedia) -> None:
    """Fail closed if a signed upload was replaced after submission."""
    if asset.processing_status != MediaProcessingStatus.READY or (
        asset.kind == "video" and (asset.sanitized_at is None or asset.duration_seconds is None)
    ):
        raise MediaNotReady
    try:
        current_size = await asyncio.to_thread(storage.head_object, asset.object_key)
        valid = current_size == asset.size_bytes and await asyncio.to_thread(
            storage.content_matches_declared_type, asset.object_key, asset.content_type
        )
    except Exception as exc:
        raise MediaStorageUnavailable from exc
    if not valid:
        raise MediaObjectChanged


async def presign_media_upload(
    cache: RedisCache,
    owner_uuid: UUID,
    *,
    content_type: str,
) -> tuple[str, dict[str, str], str, int]:
    count = await cache.incr_with_expire(
        property_media_presign_key(str(owner_uuid)), TTL_PROPERTY_MEDIA_PRESIGN
    )
    if count > PRESIGN_LIMIT_PER_HOUR:
        raise MediaUploadRateExceeded
    object_key = build_media_key(owner_uuid, content_type)
    max_bytes = _max_bytes(content_type)
    url, fields = storage.presign_upload_post(object_key, content_type, max_bytes=max_bytes)
    return url, fields, object_key, max_bytes


async def create_submission(
    db: AsyncSession,
    payload: SubmissionCreate,
    owner_uuid: UUID,
) -> PropertySubmission:
    owner_prefix = f"{_STAGING_PREFIX}{owner_uuid}/"
    verified: list[tuple[SubmissionMediaInput, UUID, str, int, str, datetime | None]] = []
    canonical_keys: list[str] = []
    try:
        for asset in payload.media:
            if not asset.object_key.startswith(owner_prefix):
                raise MediaObjectKeyMismatch
            try:
                size = await asyncio.to_thread(storage.head_object, asset.object_key)
                if size is None or size < 1 or size > _max_bytes(asset.content_type):
                    raise MediaUploadMissing
                if not await asyncio.to_thread(
                    storage.content_matches_declared_type,
                    asset.object_key,
                    asset.content_type,
                ):
                    raise MediaContentMismatch
                media_id = uuid.uuid4()
                canonical_key = (
                    f"{_CANONICAL_PREFIX}{owner_uuid}/{media_id}/"
                    f"{'upload' if asset.kind == 'video' else 'asset'}"
                    f"{_MEDIA_EXTENSION[asset.content_type]}"
                )
                canonical_keys.append(canonical_key)
                if asset.kind == "video":
                    await asyncio.to_thread(
                        storage.copy_object,
                        asset.object_key,
                        canonical_key,
                        asset.content_type,
                    )
                    processing_status = MediaProcessingStatus.PENDING
                    sanitized_at = None
                else:
                    size = await asyncio.to_thread(
                        canonicalize_object,
                        asset.object_key,
                        canonical_key,
                        asset.content_type,
                        max_bytes=_max_bytes(asset.content_type),
                    )
                    processing_status = MediaProcessingStatus.READY
                    sanitized_at = datetime.now(UTC)
                canonical_size = await asyncio.to_thread(storage.head_object, canonical_key)
                canonical_valid = canonical_size == size and await asyncio.to_thread(
                    storage.content_matches_declared_type,
                    canonical_key,
                    asset.content_type,
                )
                if not canonical_valid:
                    raise MediaStorageUnavailable
            except (MediaUploadMissing, MediaContentMismatch):
                raise
            except MalwareDetected as exc:
                await _delete_objects([asset.object_key])
                raise MediaContentMismatch from exc
            except ScannerUnavailable as exc:
                raise MediaStorageUnavailable from exc
            except MediaProcessingError as exc:
                await _delete_objects([asset.object_key])
                raise MediaContentMismatch from exc
            except MediaStorageUnavailable:
                raise
            except Exception as exc:
                raise MediaStorageUnavailable from exc
            verified.append((asset, media_id, canonical_key, size, processing_status, sanitized_at))
    except Exception:
        await _delete_objects(canonical_keys)
        raise

    data = payload.model_dump(exclude={"media"})
    submission = PropertySubmission(
        submitter_uuid=owner_uuid,
        business_line="real_estate",
        image=None,
        **data,
    )
    db.add(submission)
    await db.flush()
    for asset, media_id, canonical_key, size, processing_status, sanitized_at in verified:
        db.add(
            PropertySubmissionMedia(
                id=media_id,
                submission_uuid=submission.id,
                business_line="real_estate",
                kind=asset.kind,
                content_type=asset.content_type,
                object_key=canonical_key,
                size_bytes=size,
                position=asset.position,
                processing_status=processing_status,
                processed_at=sanitized_at,
                sanitized_at=sanitized_at,
            )
        )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await _delete_objects(canonical_keys)
        raise
    await _delete_objects([asset.object_key for asset in payload.media])
    return submission


def format_inr_display(paise: int) -> str:
    """Derive the catalog display string from integer paise. >= 1 Cr -> 'Cr',
    else 'L'. Trims trailing zeros: 78_00_000_00 paise -> '₹78 L'."""
    rupees = paise // 100
    if rupees >= 10_000_000:  # >= 1 crore
        value = rupees / 10_000_000
        unit = "Cr"
    else:
        value = rupees / 100_000
        unit = "L"
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return f"₹{text} {unit}"


async def approve_submission(
    submission_id: UUID, reviewer_uuid: UUID, *, reviewer_role: str | None = None
) -> UUID | None:
    async with AsyncSessionLocal() as session:
        # FOR UPDATE: serialize concurrent approvals so the second sees status !=
        # pending (no duplicate Property).
        sub = await session.get(PropertySubmission, submission_id, with_for_update=True)
        if sub is None:
            return None
        if sub.status != SubmissionStatus.PENDING:
            raise SubmissionAlreadyReviewed
        media = list(
            (
                await session.scalars(
                    select(PropertySubmissionMedia)
                    .where(PropertySubmissionMedia.submission_uuid == sub.id)
                    .order_by(PropertySubmissionMedia.position, PropertySubmissionMedia.id)
                )
            ).all()
        )
        property_uuid = uuid.uuid4()
        public_media: list[PropertyMedia] = []
        promoted_sources: list[str] = []
        promoted_public_keys: list[str] = []
        for asset in media:
            try:
                await verify_stored_media(asset)
            except (MediaObjectChanged, MediaStorageUnavailable, MediaNotReady):
                await session.rollback()
                raise
        public_assets = [asset for asset in media if asset.kind in {"image", "video"}]
        for public_position, asset in enumerate(public_assets):
            filename = asset.object_key.rsplit("/", 1)[-1]
            public_key = f"{_PUBLIC_PREFIX}{property_uuid}/{asset.id}/{filename}"
            try:
                await asyncio.to_thread(
                    storage.copy_object, asset.object_key, public_key, asset.content_type
                )
                promoted_public_keys.append(public_key)
                public_size = await asyncio.to_thread(storage.head_object, public_key)
                public_valid = public_size == asset.size_bytes and await asyncio.to_thread(
                    storage.content_matches_declared_type,
                    public_key,
                    asset.content_type,
                )
                if not public_valid:
                    raise MediaStorageUnavailable
            except MediaStorageUnavailable:
                await session.rollback()
                await _delete_objects(promoted_public_keys)
                raise
            except Exception as exc:
                await session.rollback()
                await _delete_objects(promoted_public_keys)
                raise MediaStorageUnavailable from exc
            public_media.append(
                PropertyMedia(
                    property_uuid=property_uuid,
                    business_line="real_estate",
                    kind=asset.kind,
                    content_type=asset.content_type,
                    object_key=public_key,
                    size_bytes=asset.size_bytes,
                    position=public_position,
                    duration_seconds=asset.duration_seconds,
                    sanitized_at=asset.sanitized_at,
                )
            )
            promoted_sources.append(asset.object_key)

        prop = Property(
            id=property_uuid,
            business_line="real_estate",
            active=True,
            title=sub.title,
            type=sub.type,
            location=sub.location,
            price_display=format_inr_display(sub.price_paise),
            meta=sub.meta,
            image=sub.image,
            category=sub.category,
            city=sub.city,
            locality=sub.locality,
            pincode=sub.pincode,
            price_paise=sub.price_paise,
            bhk=sub.bhk,
            area_sqft=sub.area_sqft,
            furnishing=sub.furnishing,
            construction_status=sub.construction_status,
            amenities=list(sub.amenities),
            age_years=sub.age_years,
            rera_number=sub.rera_number,
            details=dict(sub.details),
        )
        try:
            session.add(prop)
            session.add_all(public_media)
            await session.flush()
            sub.status = SubmissionStatus.APPROVED
            sub.reviewed_by_uuid = reviewer_uuid
            sub.reviewed_at = datetime.now(UTC)
            sub.approved_property_id = prop.id
            # Approval is what makes a listing publicly visible, so it is the audited
            # moment. Same transaction as the Property insert and the status flip.
            await record_audit(
                session,
                action=AuditAction.PROPERTY_SUBMISSION_APPROVED,
                entity_type="property_submission",
                entity_uuid=sub.id,
                actor_uuid=reviewer_uuid,
                actor_role=reviewer_role,
                business_line=sub.business_line,
                detail={
                    "created_property_uuid": str(prop.id),
                    "submitter_uuid": str(sub.submitter_uuid),
                    "price_paise": sub.price_paise,
                    "city": sub.city,
                },
            )
            await session.commit()
        except Exception:
            await session.rollback()
            await _delete_objects(promoted_public_keys)
            raise
        await _delete_objects(promoted_sources)
        return prop.id


async def reject_submission(
    submission_id: UUID, reviewer_uuid: UUID, note: str, *, reviewer_role: str | None = None
) -> bool:
    async with AsyncSessionLocal() as session:
        sub = await session.get(PropertySubmission, submission_id, with_for_update=True)
        if sub is None:
            return False
        if sub.status != SubmissionStatus.PENDING:
            raise SubmissionAlreadyReviewed
        sub.status = SubmissionStatus.REJECTED
        sub.review_note = note
        sub.reviewed_by_uuid = reviewer_uuid
        sub.reviewed_at = datetime.now(UTC)
        await record_audit(
            session,
            action=AuditAction.PROPERTY_SUBMISSION_REJECTED,
            entity_type="property_submission",
            entity_uuid=sub.id,
            actor_uuid=reviewer_uuid,
            actor_role=reviewer_role,
            business_line=sub.business_line,
            detail={"review_note_recorded": True, "submitter_uuid": str(sub.submitter_uuid)},
        )
        await session.commit()
        return True


async def purge_media_lifecycle() -> dict[str, int]:
    """Delete stale private uploads and public images for inactive listings.

    Objects still referenced by pending submissions, recent rejections, approved
    reviewer documents, or active catalogue media stay protected. Approved image
    sources are intentionally omitted because their public copies are canonical.
    """
    from datetime import timedelta

    cutoff = datetime.now(UTC) - timedelta(hours=1)
    rejected_cutoff = datetime.now(UTC) - timedelta(days=30)
    private_objects, public_objects = await asyncio.gather(
        asyncio.to_thread(storage.list_objects, _PRIVATE_PREFIX),
        asyncio.to_thread(storage.list_objects, _PUBLIC_PREFIX),
    )

    async with AsyncSessionLocal() as session:
        submission_rows = (
            await session.execute(
                select(
                    PropertySubmissionMedia,
                    PropertySubmission.status,
                    PropertySubmission.reviewed_at,
                ).join(
                    PropertySubmission,
                    PropertySubmission.id == PropertySubmissionMedia.submission_uuid,
                )
            )
        ).all()
        protected_private = {
            media.object_key
            for media, status, reviewed_at in submission_rows
            if (status == SubmissionStatus.PENDING)
            or (media.kind == "document" and status == SubmissionStatus.APPROVED)
            or (
                status == SubmissionStatus.REJECTED
                and (reviewed_at is None or reviewed_at >= rejected_cutoff)
            )
        }
        active_public = set(
            (
                await session.scalars(
                    select(PropertyMedia.object_key)
                    .join(Property, Property.id == PropertyMedia.property_uuid)
                    .where(Property.active.is_(True))
                )
            ).all()
        )

    deleted = 0
    for obj in [*private_objects, *public_objects]:
        if obj["last_modified"] >= cutoff:
            continue
        protected = protected_private if obj["key"].startswith(_PRIVATE_PREFIX) else active_public
        if obj["key"] not in protected:
            await asyncio.to_thread(storage.delete_object, obj["key"])
            deleted += 1
    return {
        "scanned": len(private_objects) + len(public_objects),
        "deleted": deleted,
    }
