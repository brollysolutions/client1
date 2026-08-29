"""Secure lifecycle and where-used reporting for reusable campaign artwork."""

from __future__ import annotations

import asyncio
import re
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from io import BytesIO
from uuid import UUID

from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import campaign_artwork
from app.models.audit_log import AuditAction
from app.models.banner import Banner, BannerTemplate
from app.models.campaign_media import CampaignMediaAsset
from app.models.offer import Offer
from app.schemas.campaign_media import (
    CampaignMediaCreate,
    CampaignMediaRead,
    CampaignMediaUpdate,
    CampaignMediaUsage,
)
from app.services import media_processing, storage
from app.services.audit_log import record as record_audit

MEDIA_MAX_BYTES = 4 * 1024 * 1024
_STAGING_PREFIX = "private/campaign-media/staging/"
_CANONICAL_PREFIX = "public/campaign-media/"
_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


class CampaignMediaInvalid(Exception):
    """The uploaded asset failed content, path, or dimension validation."""


class CampaignMediaInUse(Exception):
    """A permanent delete targeted an asset with campaign references."""


async def resolve_campaign_asset(
    db: AsyncSession,
    *,
    asset_id: UUID | None,
    business_line: str,
    allowed_usage_types: set[str],
) -> CampaignMediaAsset | None:
    if asset_id is None:
        return None
    asset = await db.get(CampaignMediaAsset, asset_id)
    if (
        asset is None
        or not asset.active
        or asset.usage_type not in allowed_usage_types
        or (asset.business_line != "both" and asset.business_line != business_line)
    ):
        raise CampaignMediaInvalid
    if asset_image_url(asset.image_ref) is None:
        raise CampaignMediaInvalid
    return asset


def asset_image_url(image_ref: str) -> str | None:
    """Resolve a campaign artwork reference to a servable URL.

    Two shapes reach this function. Bundled artwork ships with the web app and
    is referenced by its stable public path; uploaded artwork lives under the
    object store's `public/` prefix. `storage.public_asset_url` knows only the
    second, so every banner/offer `image_key` must resolve through here --
    calling `public_asset_url` directly returns None for bundled artwork, which
    silently renders an imageless campaign and (via
    `offers.validate_offer_for_review`) blocks submission outright.
    """
    if image_ref.startswith("/banner-templates/") and ".." not in image_ref:
        return image_ref
    return storage.public_asset_url(image_ref)


def presign_campaign_media(content_type: str, filename: str) -> tuple[str, dict[str, str], str]:
    if content_type not in _ALLOWED_TYPES:
        raise CampaignMediaInvalid
    safe_name = _SAFE_NAME_RE.sub("_", filename).lstrip(".")[-100:] or "artwork"
    key = f"{_STAGING_PREFIX}{uuid.uuid4()}/{safe_name}"
    url, fields = storage.presign_upload_post(key, content_type, max_bytes=MEDIA_MAX_BYTES)
    return url, fields, key


def _dimensions(image_ref: str) -> tuple[int, int]:
    content = storage.read_object_bytes(image_ref, max_bytes=MEDIA_MAX_BYTES)
    if content is None:
        raise CampaignMediaInvalid
    try:
        with Image.open(BytesIO(content)) as image:
            image.load()
            return image.size
    except (OSError, UnidentifiedImageError) as exc:
        raise CampaignMediaInvalid from exc


def _validate_dimensions(usage_type: str, width: int, height: int) -> None:
    """Check artwork against the geometry of the surface it is destined for.

    Each usage type names one surface, so the ratio is checked against that
    surface's target rather than a single band wide enough to admit every
    placement. Without this a 1200x480 (2.50) upload passed as homepage artwork
    and then rendered wrong inside the 9:5 hero.
    """
    spec = campaign_artwork.spec_for(usage_type)
    if spec is None or not spec.accepts(width, height):
        raise CampaignMediaInvalid


async def create_asset(
    db: AsyncSession,
    *,
    payload: CampaignMediaCreate,
    actor_uuid: UUID,
    actor_role: str,
) -> CampaignMediaAsset:
    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[
        payload.content_type
    ]
    destination = f"{_CANONICAL_PREFIX}{uuid.uuid4()}/artwork{suffix}"
    try:
        byte_size = await asyncio.to_thread(
            media_processing.canonicalize_object,
            payload.object_key,
            destination,
            payload.content_type,
            max_bytes=MEDIA_MAX_BYTES,
        )
        width, height = await asyncio.to_thread(_dimensions, destination)
        _validate_dimensions(payload.usage_type, width, height)
    except (media_processing.MediaProcessingError, CampaignMediaInvalid) as exc:
        await asyncio.to_thread(storage.delete_object, payload.object_key)
        await asyncio.to_thread(storage.delete_object, destination)
        raise CampaignMediaInvalid from exc
    await asyncio.to_thread(storage.delete_object, payload.object_key)
    asset = CampaignMediaAsset(
        business_line=payload.business_line,
        usage_type=payload.usage_type,
        title=payload.title,
        alt_text=payload.alt_text,
        tags=payload.tags,
        image_ref=destination,
        mime_type=payload.content_type,
        width=width,
        height=height,
        byte_size=byte_size,
        source_type="upload",
        source_reference=payload.source_reference,
        active=True,
        created_by_uuid=actor_uuid,
    )
    try:
        db.add(asset)
        await db.flush()
        await record_audit(
            db,
            action=AuditAction.CAMPAIGN_MEDIA_CREATED,
            entity_type="campaign_media_asset",
            entity_uuid=asset.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line=asset.business_line,
            detail={"usage_type": asset.usage_type, "mime_type": asset.mime_type},
        )
        await db.commit()
    except Exception:
        await db.rollback()
        # Canonicalization publishes before the database row exists. If that
        # transaction fails, remove the otherwise-untracked public object.
        await asyncio.to_thread(storage.delete_object, destination)
        raise
    await db.refresh(asset)
    return asset


async def asset_usages(db: AsyncSession, asset_id: UUID) -> list[CampaignMediaUsage]:
    usages: list[CampaignMediaUsage] = []
    templates = (
        await db.scalars(select(BannerTemplate).where(BannerTemplate.media_asset_id == asset_id))
    ).all()
    usages.extend(
        CampaignMediaUsage(
            kind="banner_template",
            entity_id=item.id,
            label=f"{item.label} · v{item.version}",
            status="active" if item.active else "retired",
        )
        for item in templates
    )
    banners = (await db.scalars(select(Banner).where(Banner.media_asset_id == asset_id))).all()
    usages.extend(
        CampaignMediaUsage(
            kind="banner", entity_id=item.id, label=item.title, status=item.status.value
        )
        for item in banners
    )
    offers = (await db.scalars(select(Offer).where(Offer.media_asset_id == asset_id))).all()
    usages.extend(
        CampaignMediaUsage(
            kind="offer", entity_id=item.id, label=item.title, status=item.status.value
        )
        for item in offers
    )
    return usages


async def usage_counts(db: AsyncSession, asset_ids: Sequence[UUID]) -> dict[UUID, int]:
    """Reference counts for many assets in three grouped queries.

    The catalogue listing used to build the full `usages` list for every asset,
    which is three queries each -- around 190 for a library of sixty. Only the
    count is shown in the grid, so the listing takes this and the detail route
    keeps the itemised version.
    """
    counts: dict[UUID, int] = {}
    if not asset_ids:
        return counts
    ids = list(asset_ids)
    for model in (BannerTemplate, Banner, Offer):
        rows = await db.execute(
            select(model.media_asset_id, func.count())
            .where(model.media_asset_id.in_(ids))
            .group_by(model.media_asset_id)
        )
        for asset_id, count in rows:
            counts[asset_id] = counts.get(asset_id, 0) + count
    return counts


async def read_asset(
    db: AsyncSession,
    asset: CampaignMediaAsset,
    *,
    usage_count: int | None = None,
) -> CampaignMediaRead:
    """Response shape for one asset.

    Pass `usage_count` from `usage_counts` to render a listing row: the
    itemised `usages` list is then left empty rather than costing three
    queries per row. The single-asset routes omit it and get the full list.
    """
    image_url = asset_image_url(asset.image_ref)
    if image_url is None:
        raise CampaignMediaInvalid
    usages = [] if usage_count is not None else await asset_usages(db, asset.id)
    return CampaignMediaRead(
        id=asset.id,
        business_line=asset.business_line,
        usage_type=asset.usage_type,
        title=asset.title,
        alt_text=asset.alt_text,
        tags=asset.tags,
        image_url=image_url,
        mime_type=asset.mime_type,
        width=asset.width,
        height=asset.height,
        byte_size=asset.byte_size,
        source_type=asset.source_type,
        source_reference=asset.source_reference,
        active=asset.active,
        created_by_uuid=asset.created_by_uuid,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        archived_at=asset.archived_at,
        usage_count=usage_count if usage_count is not None else len(usages),
        usages=usages,
    )


async def update_asset(
    db: AsyncSession,
    *,
    asset: CampaignMediaAsset,
    payload: CampaignMediaUpdate,
    actor_uuid: UUID,
    actor_role: str,
) -> CampaignMediaAsset:
    values = payload.model_dump(exclude_unset=True)
    if "title" in values:
        values["title"] = values["title"].strip()
    if "alt_text" in values:
        values["alt_text"] = values["alt_text"].strip()
    if "tags" in values:
        values["tags"] = list(
            dict.fromkeys(item.strip().lower() for item in values["tags"] if item.strip())
        )
    if "source_reference" in values and values["source_reference"] is not None:
        values["source_reference"] = values["source_reference"].strip() or None
    if values.get("active") is False:
        asset.archived_at = datetime.now(UTC)
    elif values.get("active") is True:
        asset.archived_at = None
    for field, value in values.items():
        setattr(asset, field, value)
    asset.updated_at = datetime.now(UTC)
    await record_audit(
        db,
        action=(
            AuditAction.CAMPAIGN_MEDIA_ARCHIVED
            if values.get("active") is False
            else AuditAction.CAMPAIGN_MEDIA_UPDATED
        ),
        entity_type="campaign_media_asset",
        entity_uuid=asset.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=asset.business_line,
        detail={"fields": sorted(values)},
    )
    await db.commit()
    await db.refresh(asset)
    return asset


async def delete_asset(
    db: AsyncSession,
    *,
    asset: CampaignMediaAsset,
    actor_uuid: UUID,
    actor_role: str,
) -> None:
    if await asset_usages(db, asset.id):
        raise CampaignMediaInUse
    image_ref = asset.image_ref
    is_managed_upload = asset.source_type == "upload" and image_ref.startswith(_CANONICAL_PREFIX)
    await record_audit(
        db,
        action=AuditAction.CAMPAIGN_MEDIA_DELETED,
        entity_type="campaign_media_asset",
        entity_uuid=asset.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=asset.business_line,
        detail={"usage_type": asset.usage_type, "managed_object": is_managed_upload},
    )
    await db.delete(asset)
    await db.commit()
    if is_managed_upload:
        await asyncio.to_thread(storage.delete_object, image_ref)
