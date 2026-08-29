"""Property-submission mutations on explicit, bypassed service sessions.

Approval/rejection run behind the platform-Admin route guard. Update/withdraw
repeat owner-or-platform-Admin checks inside the service before touching a row.
Approval changes the catalogue and review state in one transaction, so the
catalogue's SELECT-only api_user grant remains untouched.
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
from app.db.session import AsyncSessionLocal
from app.models.audit_log import AuditAction
from app.models.property import (
    ListingIntent,
    Property,
    ReraApplicability,
    ReraVerificationStatus,
)
from app.models.property_media import (
    MediaProcessingStatus,
    PropertyMedia,
    PropertySubmissionMedia,
)
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.schemas.property_submissions import (
    SubmissionCreate,
    SubmissionMediaInput,
    SubmissionUpdate,
)
from app.services import storage
from app.services.audit_log import record as record_audit
from app.services.media_processing import (
    MalwareDetected,
    MediaProcessingError,
    ScannerUnavailable,
    canonicalize_object,
    validate_panorama_bytes,
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


class SubmissionNotEditable(Exception):
    """Raised when a withdrawn listing is targeted for another edit."""


class ReraReviewRequired(Exception):
    """Raised when publication is attempted without the required RERA review."""


class InvalidReraReview(Exception):
    """Raised when a reviewer outcome conflicts with the applicant assertion."""


def _max_bytes(content_type: str) -> int:
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
    if asset.processing_status != MediaProcessingStatus.READY:
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


def validate_panorama_object(object_key: str, content_type: str) -> None:
    content = storage.read_object_bytes(object_key, max_bytes=IMAGE_MAX_BYTES)
    if content is None:
        raise MediaProcessingError
    validate_panorama_bytes(content, content_type)


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
                    f"asset{_MEDIA_EXTENSION[asset.content_type]}"
                )
                canonical_keys.append(canonical_key)
                size = await asyncio.to_thread(
                    canonicalize_object,
                    asset.object_key,
                    canonical_key,
                    asset.content_type,
                    max_bytes=_max_bytes(asset.content_type),
                )
                if asset.kind == "panorama":
                    await asyncio.to_thread(
                        validate_panorama_object,
                        canonical_key,
                        asset.content_type,
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

    data = payload.model_dump(exclude={"media", "structured_details"})
    data["structured_details"] = payload.structured_details.model_dump(mode="json")
    submission = PropertySubmission(
        submitter_uuid=owner_uuid,
        business_line="real_estate",
        image=None,
        details={},
        details_version=1,
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


def _can_manage_submission(
    submission: PropertySubmission,
    actor_uuid: UUID,
    *,
    actor_role: str,
    platform_scope: str | None,
) -> bool:
    return submission.submitter_uuid == actor_uuid or (
        actor_role == "admin" and platform_scope == "true"
    )


def _payload_fact_values(payload: SubmissionCreate | SubmissionUpdate) -> dict[str, object]:
    values = payload.model_dump(exclude={"media", "structured_details", "listing_links"})
    values["structured_details"] = payload.structured_details.model_dump(mode="json")
    # JSON mode so the derived platform lands in JSONB as its string value and
    # not as an enum member the driver would have to coerce.
    values["listing_links"] = (
        [link.model_dump(mode="json") for link in payload.listing_links]
        if payload.listing_links is not None
        else None
    )
    return values


def _copy_submission_facts(target: PropertySubmission | Property, source: object) -> None:
    values = (
        _payload_fact_values(source)
        if isinstance(source, (SubmissionCreate, SubmissionUpdate))
        else {field: getattr(source, field) for field in SubmissionUpdate.model_fields}
    )
    for field, value in values.items():
        setattr(target, field, value)
    target.details_version = 1 if values["structured_details"] is not None else None
    if isinstance(target, Property):
        target.price_display = format_inr_display(target.price_paise, target.listing_intent)


def _copy_rera_review(target: Property, source: PropertySubmission) -> None:
    target.rera_verification_status = source.rera_verification_status
    target.rera_verified_at = source.rera_verified_at
    target.rera_verified_by_uuid = source.rera_verified_by_uuid


async def update_submission(
    submission_id: UUID,
    payload: SubmissionUpdate,
    actor_uuid: UUID,
    *,
    actor_role: str,
    platform_scope: str | None,
) -> bool:
    """Update listing facts under a row lock and return reviewed rows to review."""
    async with AsyncSessionLocal() as session:
        sub = await session.get(PropertySubmission, submission_id, with_for_update=True)
        if sub is None or not _can_manage_submission(
            sub, actor_uuid, actor_role=actor_role, platform_scope=platform_scope
        ):
            return False
        if sub.status == SubmissionStatus.WITHDRAWN:
            raise SubmissionNotEditable
        previous_status = sub.status
        values = _payload_fact_values(payload)
        changed_fields = sorted(
            field for field, value in values.items() if getattr(sub, field) != value
        )
        if not changed_fields:
            return True
        _copy_submission_facts(sub, payload)
        sub.status = SubmissionStatus.PENDING
        sub.review_note = None
        sub.reviewed_by_uuid = None
        sub.reviewed_at = None
        sub.rera_verification_status = ReraVerificationStatus.NOT_REVIEWED
        sub.rera_verified_at = None
        sub.rera_verified_by_uuid = None
        sub.rera_review_note = None
        await record_audit(
            session,
            action=AuditAction.PROPERTY_LISTING_UPDATED,
            entity_type="property_submission",
            entity_uuid=sub.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line=sub.business_line,
            detail={
                "operation": "facts_updated",
                "previous_status": previous_status.value,
                "changed_fields": changed_fields,
                "approved_property_uuid": (
                    str(sub.approved_property_id) if sub.approved_property_id else None
                ),
            },
        )
        await session.commit()
        return True


async def review_rera(
    submission_id: UUID,
    reviewer_uuid: UUID,
    outcome: ReraVerificationStatus,
    note: str | None,
    *,
    reviewer_role: str | None = None,
) -> bool:
    """Record an Admin-only registry outcome without trusting applicant data."""
    async with AsyncSessionLocal() as session:
        sub = await session.get(PropertySubmission, submission_id, with_for_update=True)
        if sub is None or sub.status == SubmissionStatus.WITHDRAWN:
            return False
        if outcome == ReraVerificationStatus.VERIFIED and (
            sub.rera_applicability != ReraApplicability.APPLICABLE or not sub.rera_number
        ):
            raise InvalidReraReview
        if outcome == ReraVerificationStatus.EXEMPTION_VERIFIED and (
            sub.rera_applicability != ReraApplicability.EXEMPTION_CLAIMED
        ):
            raise InvalidReraReview
        withdrawing = outcome == ReraVerificationStatus.NOT_REVIEWED
        if withdrawing and sub.rera_verification_status == ReraVerificationStatus.NOT_REVIEWED:
            # Nothing to take back; treat as a no-op rather than writing a
            # reviewer stamp onto a row that was never reviewed.
            raise InvalidReraReview

        now = datetime.now(UTC)
        sub.rera_verification_status = outcome
        # Withdrawing clears the stamp: the row is genuinely un-reviewed again, so
        # it must not keep pointing at a reviewer who no longer stands behind it.
        # The note survives so the audit trail explains the withdrawal.
        sub.rera_verified_at = None if withdrawing else now
        sub.rera_verified_by_uuid = None if withdrawing else reviewer_uuid
        sub.rera_review_note = note.strip() if note else None
        catalogue_deactivated = False
        if sub.approved_property_id is not None:
            prop = await session.get(Property, sub.approved_property_id, with_for_update=True)
            if prop is not None and (
                sub.status == SubmissionStatus.APPROVED
                or outcome == ReraVerificationStatus.MISMATCH
                or withdrawing
            ):
                _copy_rera_review(prop, sub)
                # A live listing must never keep serving as RERA-verified once the
                # verification is gone — same rule that already covers a mismatch.
                if (outcome == ReraVerificationStatus.MISMATCH or withdrawing) and prop.active:
                    prop.active = False
                    catalogue_deactivated = True

        await record_audit(
            session,
            action=AuditAction.PROPERTY_LISTING_UPDATED,
            entity_type="property_submission",
            entity_uuid=sub.id,
            actor_uuid=reviewer_uuid,
            actor_role=reviewer_role,
            business_line=sub.business_line,
            detail={
                "operation": "rera_withdrawn" if withdrawing else "rera_reviewed",
                "outcome": outcome.value,
                "applicability": sub.rera_applicability.value,
                "approved_property_uuid": (
                    str(sub.approved_property_id) if sub.approved_property_id else None
                ),
                "review_note_recorded": bool(note),
                "catalogue_deactivated": catalogue_deactivated,
            },
        )
        await session.commit()
        return True


async def withdraw_submission(
    submission_id: UUID,
    actor_uuid: UUID,
    *,
    actor_role: str,
    platform_scope: str | None,
) -> bool:
    """Soft-delete one owned listing and deactivate its approved catalogue row."""
    async with AsyncSessionLocal() as session:
        sub = await session.get(PropertySubmission, submission_id, with_for_update=True)
        if sub is None or not _can_manage_submission(
            sub, actor_uuid, actor_role=actor_role, platform_scope=platform_scope
        ):
            return False
        if sub.status == SubmissionStatus.WITHDRAWN:
            return True
        previous_status = sub.status
        deactivated = False
        if sub.approved_property_id is not None:
            prop = await session.get(Property, sub.approved_property_id, with_for_update=True)
            if prop is not None and prop.active:
                prop.active = False
                deactivated = True
        sub.status = SubmissionStatus.WITHDRAWN
        await record_audit(
            session,
            action=AuditAction.PROPERTY_LISTING_UPDATED,
            entity_type="property_submission",
            entity_uuid=sub.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line=sub.business_line,
            detail={
                "operation": "withdrawn",
                "previous_status": previous_status.value,
                "approved_property_uuid": (
                    str(sub.approved_property_id) if sub.approved_property_id else None
                ),
                "catalogue_deactivated": deactivated,
            },
        )
        await session.commit()
        return True


def format_inr_amount(paise: int) -> str:
    """Render integer paise as a lakh/crore capital amount: '₹78 L', '₹2.6 Cr'."""
    rupees = paise // 100
    if rupees >= 10_000_000:  # >= 1 crore
        value = rupees / 10_000_000
        unit = "Cr"
    else:
        value = rupees / 100_000
        unit = "L"
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return f"₹{text} {unit}"


def format_inr_rent(paise: int) -> str:
    """Render integer paise as an exact monthly rent: '₹25,000/month'.

    Rent is not a lakh/crore quantity — ``format_inr_amount`` would turn a
    ₹25,000 rent into '₹0.25 L', which reads as a sale price and is useless to a
    tenant. Grouping follows the Indian system (₹1,25,000, not ₹125,000).
    """

    rupees = paise // 100
    digits = str(rupees)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        grouped = ",".join([*groups, tail])
    else:
        grouped = digits
    return f"₹{grouped}/month"


def format_inr_display(paise: int, intent: ListingIntent = ListingIntent.SALE) -> str:
    """Derive the catalog display string from integer paise, intent-aware.

    ``price_paise`` carries the sale price for a sale listing and the monthly
    rent for a rental, so the same column needs two very different renderings.
    """

    if intent == ListingIntent.RENT:
        return format_inr_rent(paise)
    return format_inr_amount(paise)


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
        if (
            (
                sub.rera_applicability == ReraApplicability.APPLICABLE
                and sub.rera_verification_status != ReraVerificationStatus.VERIFIED
            )
            or (
                sub.rera_applicability == ReraApplicability.EXEMPTION_CLAIMED
                and sub.rera_verification_status != ReraVerificationStatus.EXEMPTION_VERIFIED
            )
            or sub.rera_applicability == ReraApplicability.UNSURE
        ):
            raise ReraReviewRequired
        media = list(
            (
                await session.scalars(
                    select(PropertySubmissionMedia)
                    .where(PropertySubmissionMedia.submission_uuid == sub.id)
                    .order_by(PropertySubmissionMedia.position, PropertySubmissionMedia.id)
                )
            ).all()
        )
        property_uuid = sub.approved_property_id or uuid.uuid4()
        is_reapproval = sub.approved_property_id is not None
        public_media: list[PropertyMedia] = []
        promoted_sources: list[str] = []
        promoted_public_keys: list[str] = []
        for asset in media if not is_reapproval else []:
            try:
                await verify_stored_media(asset)
            except (MediaObjectChanged, MediaStorageUnavailable, MediaNotReady):
                await session.rollback()
                raise
        public_assets = (
            [asset for asset in media if asset.kind in {"image", "panorama"}]
            if not is_reapproval
            else []
        )
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
                    sanitized_at=asset.sanitized_at,
                )
            )
            promoted_sources.append(asset.object_key)

        if is_reapproval:
            prop = await session.get(Property, property_uuid, with_for_update=True)
            if prop is None:
                await session.rollback()
                raise MediaStorageUnavailable
            _copy_submission_facts(prop, sub)
            _copy_rera_review(prop, sub)
        else:
            prop = Property(
                id=property_uuid,
                business_line="real_estate",
                active=True,
                listing_intent=sub.listing_intent,
                title=sub.title,
                type=sub.type,
                location=sub.location,
                price_display=format_inr_display(sub.price_paise, sub.listing_intent),
                meta=sub.meta,
                image=sub.image,
                category=sub.category,
                property_subtype=sub.property_subtype,
                city=sub.city,
                locality=sub.locality,
                state=sub.state,
                pincode=sub.pincode,
                price_paise=sub.price_paise,
                security_deposit_paise=sub.security_deposit_paise,
                minimum_lease_months=sub.minimum_lease_months,
                available_from=sub.available_from,
                listing_links=(list(sub.listing_links) if sub.listing_links is not None else None),
                bhk=sub.bhk,
                area_sqft=sub.area_sqft,
                furnishing=sub.furnishing,
                construction_status=sub.construction_status,
                amenities=list(sub.amenities),
                age_years=sub.age_years,
                rera_number=sub.rera_number,
                rera_applicability=sub.rera_applicability,
                rera_verification_status=sub.rera_verification_status,
                rera_verified_at=sub.rera_verified_at,
                rera_verified_by_uuid=sub.rera_verified_by_uuid,
                details=dict(sub.details),
                details_version=sub.details_version,
                structured_details=(
                    dict(sub.structured_details) if sub.structured_details is not None else None
                ),
            )
        try:
            if not is_reapproval:
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
                    "property_uuid": str(prop.id),
                    "operation": "updated" if is_reapproval else "created",
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
    """Delete stale private uploads and public media for inactive listings.

    Objects still referenced by pending submissions, recent rejections, approved
    reviewer documents, or active catalogue media stay protected. Approved image
    and panorama sources are omitted because their public copies are canonical.
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
