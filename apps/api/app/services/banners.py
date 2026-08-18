"""Banner submit/approve/reject, plus the image-upload presign + orphan purge.

submit_banner runs on the request session under RLS (shared Sub Admin team queue,
draft/rejected only — see the banners_update policy). approve_banner/reject_banner run on a bypass
superuser session, the same mechanism as services.property_submissions: the
status flip never rides the reviewer's request transaction, and api_user's UPDATE
grant never needs to cover the approval transition. Access control is the
router's require_admin guard (RLS wouldn't gate a superuser session).

presign_banner_image_upload/purge_orphaned_uploads mirror
services/agent_applications.py's upload-presign + purge_orphaned_uploads shape
exactly (build a fresh key -> signed POST with a size cap -> sweep
storage.list_objects() against the referenced set). The one structural
difference: there is a single ref column here (Banner.image_key), not four.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.banner_catalog import (
    category_label,
    expected_business_line,
    property_category_matches_campaign,
)
from app.db.session import AsyncSessionLocal
from app.models.audit_log import AuditAction
from app.models.banner import Banner, BannerPlacement, BannerStatus, BannerTemplate
from app.models.offer import Offer, OfferStatus
from app.models.property import Property
from app.schemas.banners import BannerTemplateCreate
from app.schemas.personalization import AudienceRules, audience_rules_valid_for_banner
from app.services import media_processing, storage
from app.services.audit_log import record as record_audit


class BannerAlreadyReviewed(Exception):
    """Raised when approve/reject targets a row that is not pending_approval."""


class BannerNotOwned(Exception):
    """Raised when an explicitly provenance-scoped submit targets another author.

    Distinct from "not found" (unlike property_submissions' owner-scoped
    SELECT, banners' shared-visibility SELECT means the caller can already see
    this row in their queue — a 404 here would be confusing)."""


class BannerInvalidAudience(Exception):
    """Raised when a legacy or malformed rule set reaches review."""


class BannerInvalidConfiguration(Exception):
    """Raised when placement, template, line, Offer, or property disagree."""


def template_image_url(image_ref: str) -> str | None:
    if image_ref.startswith("/banner-templates/") and ".." not in image_ref:
        return image_ref
    if image_ref.startswith("public/banner-templates/"):
        return storage.public_asset_url(image_ref)
    return None


async def validate_banner_configuration(
    db: AsyncSession,
    *,
    placement: BannerPlacement,
    business_line: str,
    template_id: UUID | None,
    offer_id: UUID | None,
    property_id: UUID | None,
    allow_legacy: bool = False,
) -> tuple[BannerTemplate | None, Offer | None, Property | None]:
    if placement == BannerPlacement.DASHBOARD:
        if template_id is not None or offer_id is not None or property_id is not None:
            raise BannerInvalidConfiguration
        return None, None, None

    if template_id is None and allow_legacy and offer_id is None and property_id is None:
        return None, None, None
    template = await db.get(BannerTemplate, template_id) if template_id else None
    if template is None or not template.active or template.placement != placement:
        raise BannerInvalidConfiguration
    if template_image_url(template.image_ref) is None:
        raise BannerInvalidConfiguration
    required_line = expected_business_line(placement)
    if required_line is not None and business_line != required_line:
        raise BannerInvalidConfiguration

    offer = await db.get(Offer, offer_id) if offer_id else None
    property_listing = await db.get(Property, property_id) if property_id else None
    if offer_id is not None and property_id is not None:
        raise BannerInvalidConfiguration
    if template.category_key == "offers" and offer is None:
        raise BannerInvalidConfiguration
    if template.category_key != "offers" and offer is not None:
        raise BannerInvalidConfiguration
    if offer is not None:
        if offer.status not in (OfferStatus.SCHEDULED, OfferStatus.ACTIVE):
            raise BannerInvalidConfiguration
        if offer.audience_rules != {}:
            raise BannerInvalidConfiguration
        if business_line != "both" and offer.business_line not in (business_line, "both"):
            raise BannerInvalidConfiguration
    if property_id is not None and (
        property_listing is None
        or not property_listing.active
        or not property_listing.rera_number.strip()
        or business_line not in ("real_estate", "both")
        or not property_category_matches_campaign(
            placement,
            template.category_key,
            property_listing.category,
            property_listing.property_subtype,
        )
    ):
        raise BannerInvalidConfiguration
    return template, offer, property_listing


async def create_template_version(
    db: AsyncSession,
    *,
    payload: BannerTemplateCreate,
    actor_uuid: UUID,
    actor_role: str,
) -> BannerTemplate:
    label = category_label(payload.placement, payload.category_key)
    if label is None or payload.placement == BannerPlacement.DASHBOARD:
        raise BannerInvalidConfiguration
    image_ref = payload.image_ref
    if image_ref.startswith("/banner-templates/"):
        bundled_ref = f"/banner-templates/{payload.placement.value}/{payload.category_key}.webp"
        if image_ref != bundled_ref or payload.content_type is not None:
            raise BannerInvalidConfiguration
    elif image_ref.startswith(_TEMPLATE_STAGING_KEY_PREFIX):
        if payload.content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
            raise BannerInvalidConfiguration
        destination_key = f"{_TEMPLATE_IMAGE_KEY_PREFIX}{uuid.uuid4()}/artwork.webp"
        # Canonicalize to the declared format. The destination extension is
        # cosmetic; object storage's explicit Content-Type and the sanitized
        # bytes are the security boundary.
        destination_key = (
            destination_key.removesuffix(".webp")
            + {
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
            }[payload.content_type]
        )
        try:
            await asyncio.to_thread(
                media_processing.canonicalize_object,
                image_ref,
                destination_key,
                payload.content_type,
                max_bytes=IMAGE_MAX_BYTES,
            )
        except media_processing.MediaProcessingError as exc:
            await asyncio.to_thread(storage.delete_object, image_ref)
            await asyncio.to_thread(storage.delete_object, destination_key)
            raise BannerInvalidConfiguration from exc
        await asyncio.to_thread(storage.delete_object, image_ref)
        image_ref = destination_key
    else:
        raise BannerInvalidConfiguration
    current = (
        await db.scalars(
            select(BannerTemplate)
            .where(
                BannerTemplate.placement == payload.placement,
                BannerTemplate.category_key == payload.category_key,
                BannerTemplate.active.is_(True),
            )
            .with_for_update()
        )
    ).one_or_none()
    if current is not None:
        current.active = False
    latest = await db.scalar(
        select(func.max(BannerTemplate.version)).where(
            BannerTemplate.placement == payload.placement,
            BannerTemplate.category_key == payload.category_key,
        )
    )
    template = BannerTemplate(
        placement=payload.placement,
        category_key=payload.category_key,
        label=label,
        version=(latest or 0) + 1,
        image_ref=image_ref,
        active=True,
        created_by_uuid=actor_uuid,
    )
    db.add(template)
    await db.flush()
    await record_audit(
        db,
        action=AuditAction.BANNER_TEMPLATE_VERSIONED,
        entity_type="banner_template",
        entity_uuid=template.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        detail={"placement": payload.placement.value, "category_key": payload.category_key},
    )
    await db.commit()
    await db.refresh(template)
    return template


async def submit_banner(
    banner_id: UUID,
    submitter_uuid: UUID,
    db: AsyncSession,
    *,
    can_manage_any: bool = False,
) -> Banner | None:
    """Move draft/rejected to pending approval, optionally provenance-scoped."""
    banner = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if banner is None:
        return None
    if not can_manage_any and banner.created_by_uuid != submitter_uuid:
        raise BannerNotOwned
    if banner.status not in (BannerStatus.DRAFT, BannerStatus.REJECTED):
        raise BannerAlreadyReviewed
    await validate_banner_configuration(
        db,
        placement=banner.placement,
        business_line=banner.business_line,
        template_id=banner.template_id,
        offer_id=banner.offer_id,
        property_id=banner.property_id,
        allow_legacy=banner.template_id is None and banner.category_key is None,
    )
    try:
        rules = AudienceRules.model_validate(banner.audience_rules)
    except ValueError as exc:
        raise BannerInvalidAudience from exc
    if not audience_rules_valid_for_banner(banner.banner_type, rules):
        raise BannerInvalidAudience
    banner.status = BannerStatus.PENDING_APPROVAL
    banner.review_note = None
    await record_audit(
        db,
        action=AuditAction.BANNER_SUBMITTED,
        entity_type="banner",
        entity_uuid=banner.id,
        actor_uuid=submitter_uuid,
        actor_role="sub_admin",
        business_line=banner.business_line,
        detail={"placement": banner.placement.value},
    )
    await db.commit()
    await db.refresh(banner)
    return banner


async def approve_banner(banner_id: UUID, reviewer_uuid: UUID) -> Banner | None:
    async with AsyncSessionLocal() as session:
        # FOR UPDATE: serialize concurrent approvals so a second reviewer sees
        # status != pending_approval.
        banner = await session.get(Banner, banner_id, with_for_update=True)
        if banner is None:
            return None
        if banner.status != BannerStatus.PENDING_APPROVAL:
            raise BannerAlreadyReviewed
        await validate_banner_configuration(
            session,
            placement=banner.placement,
            business_line=banner.business_line,
            template_id=banner.template_id,
            offer_id=banner.offer_id,
            property_id=banner.property_id,
            allow_legacy=banner.template_id is None and banner.category_key is None,
        )
        try:
            rules = AudienceRules.model_validate(banner.audience_rules)
        except ValueError as exc:
            raise BannerInvalidAudience from exc
        if not audience_rules_valid_for_banner(banner.banner_type, rules):
            raise BannerInvalidAudience
        banner.status = BannerStatus.APPROVED
        banner.approved_by_uuid = reviewer_uuid
        banner.review_note = None
        await record_audit(
            session,
            action=AuditAction.BANNER_APPROVED,
            entity_type="banner",
            entity_uuid=banner.id,
            actor_uuid=reviewer_uuid,
            actor_role="admin",
            business_line=banner.business_line,
            detail={"placement": banner.placement.value},
        )
        await session.commit()
        await session.refresh(banner)
        return banner


async def reject_banner(banner_id: UUID, reviewer_uuid: UUID, note: str) -> Banner | None:
    async with AsyncSessionLocal() as session:
        banner = await session.get(Banner, banner_id, with_for_update=True)
        if banner is None:
            return None
        if banner.status != BannerStatus.PENDING_APPROVAL:
            raise BannerAlreadyReviewed
        banner.status = BannerStatus.REJECTED
        banner.approved_by_uuid = reviewer_uuid
        banner.review_note = note
        await record_audit(
            session,
            action=AuditAction.BANNER_REJECTED,
            entity_type="banner",
            entity_uuid=banner.id,
            actor_uuid=reviewer_uuid,
            actor_role="admin",
            business_line=banner.business_line,
            detail={"placement": banner.placement.value},
        )
        await session.commit()
        await session.refresh(banner)
        return banner


async def archive_banner(banner_id: UUID, actor_uuid: UUID, actor_role: str) -> Banner | None:
    async with AsyncSessionLocal() as session:
        banner = await session.get(Banner, banner_id, with_for_update=True)
        if banner is None:
            return None
        if banner.status in (BannerStatus.DRAFT, BannerStatus.ARCHIVED):
            raise BannerAlreadyReviewed
        banner.status = BannerStatus.ARCHIVED
        await record_audit(
            session,
            action=AuditAction.BANNER_ARCHIVED,
            entity_type="banner",
            entity_uuid=banner.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line=banner.business_line,
            detail={"placement": banner.placement.value},
        )
        await session.commit()
        await session.refresh(banner)
        return banner


_IMAGE_KEY_PREFIX = "public/banners/"
_TEMPLATE_IMAGE_KEY_PREFIX = "public/banner-templates/"
_TEMPLATE_STAGING_KEY_PREFIX = "private/banner-templates/staging/"
IMAGE_MAX_BYTES = 2 * 1024 * 1024  # 2 MiB
_ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


class UnsupportedImageType(Exception):
    """Raised when the requested content_type isn't jpeg/png/webp."""


def build_image_key(filename: str, *, template: bool = False) -> str:
    # A fresh uuid4 per call (not per-banner) so re-uploading the image on an
    # already-LIVE banner lands at a new key -- the DB row swaps to it
    # atomically on save, and the old object becomes an orphan the purge job
    # collects, rather than overwriting a key a CDN/browser may have cached.
    safe_name = _SAFE_NAME_RE.sub("_", filename).lstrip(".")[-100:] or "image"
    prefix = _TEMPLATE_STAGING_KEY_PREFIX if template else _IMAGE_KEY_PREFIX
    return f"{prefix}{uuid.uuid4()}/{safe_name}"


def presign_banner_image_upload(
    content_type: str, filename: str, *, template: bool = False
) -> tuple[str, dict[str, str], str]:
    """Returns (upload_url, fields, object_key). See storage.presign_upload_post
    for the multipart-POST shape the caller must replay to `upload_url`.

    content_type is signed into the POST policy itself (jpeg/png/webp only) --
    storage rejects a mismatched or oversize body regardless of what the
    browser claims, the same posture as the agent-application KYC upload.
    """
    if content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
        raise UnsupportedImageType
    object_key = build_image_key(filename, template=template)
    url, fields = storage.presign_upload_post(object_key, content_type, max_bytes=IMAGE_MAX_BYTES)
    return url, fields, object_key


# An uploaded-then-abandoned image (form filled, file picked, page closed
# before Save) is the only orphan class here -- unlike agent-applications'
# 15-min ticket TTL, there's no external time bound on "abandoned", so this
# mirrors loan_documents' 1h floor rather than agent-applications' 48h one:
# short enough that a stale draft doesn't keep a live-looking image key
# around for days, long enough that no in-progress form submission can race it.
_ORPHAN_MIN_AGE = timedelta(hours=1)


async def purge_orphaned_uploads(*, min_age: timedelta = _ORPHAN_MIN_AGE) -> dict[str, int]:
    """Delete objects under public/banners/ that no Banner row references.

    Same shape as services/agent_applications.py::purge_orphaned_uploads, one
    referenced column instead of four. Runs on a fresh bypass session (no
    request context in a scheduler tick) purely to read image_key -- RLS is
    irrelevant to a read-only column scan with no row-level sensitivity.
    """
    cutoff = datetime.now(UTC) - min_age
    objects = storage.list_objects(_IMAGE_KEY_PREFIX)
    candidates = [o for o in objects if o["last_modified"] < cutoff]
    if not candidates:
        return {"scanned": len(objects), "deleted": 0}

    async with AsyncSessionLocal() as session:
        referenced = set(
            (
                await session.scalars(select(Banner.image_key).where(Banner.image_key.is_not(None)))
            ).all()
        )

    deleted = 0
    for obj in candidates:
        if obj["key"] not in referenced:
            storage.delete_object(obj["key"])
            deleted += 1
    return {"scanned": len(objects), "deleted": deleted}


async def purge_orphaned_template_uploads(
    *, min_age: timedelta = _ORPHAN_MIN_AGE
) -> dict[str, int]:
    """Delete abandoned staging uploads and unreferenced canonical artwork."""
    cutoff = datetime.now(UTC) - min_age
    staging = storage.list_objects(_TEMPLATE_STAGING_KEY_PREFIX)
    canonical = storage.list_objects(_TEMPLATE_IMAGE_KEY_PREFIX)
    objects = staging + canonical
    candidates = [item for item in objects if item["last_modified"] < cutoff]
    if not candidates:
        return {"scanned": len(objects), "deleted": 0}

    async with AsyncSessionLocal() as session:
        referenced = set(
            (
                await session.scalars(
                    select(BannerTemplate.image_ref).where(
                        BannerTemplate.image_ref.like(f"{_TEMPLATE_IMAGE_KEY_PREFIX}%")
                    )
                )
            ).all()
        )

    deleted = 0
    for item in candidates:
        if item["key"] not in referenced:
            storage.delete_object(item["key"])
            deleted += 1
    return {"scanned": len(objects), "deleted": deleted}
