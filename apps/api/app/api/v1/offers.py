"""Sub Admin offer authoring and Admin approval queue."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    CurrentUser,
    get_active_user,
    require_platform_admin,
    require_sub_admin,
)
from app.db.session import get_db
from app.models.audit_log import AuditAction
from app.models.offer import Offer, OfferStatus
from app.schemas.offers import (
    OfferCreate,
    OfferImageUploadRequest,
    OfferImageUploadResponse,
    OfferListResponse,
    OfferRead,
    OfferRejectRequest,
    OfferUpdate,
)
from app.schemas.personalization import AudienceRules, audience_rules_to_storage
from app.services import storage
from app.services.audit_log import record as record_audit
from app.services.banners import IMAGE_MAX_BYTES, UnsupportedImageType, presign_banner_image_upload
from app.services.campaign_media import CampaignMediaInvalid, resolve_campaign_asset
from app.services.offers import (
    OfferIllegalTransition,
    OfferInvalidConfiguration,
    remove_offer,
    transition_offer,
)

router = APIRouter()
_EDITABLE_STATUSES = (OfferStatus.DRAFT, OfferStatus.REJECTED)


def _read(offer: Offer) -> OfferRead:
    return OfferRead.model_validate(offer, from_attributes=True).model_copy(
        update={"image_url": storage.public_asset_url(offer.image_key) if offer.image_key else None}
    )


@router.post("/image-upload-url", response_model=OfferImageUploadResponse)
async def get_offer_image_upload_url(
    payload: OfferImageUploadRequest,
    current_user: CurrentUser = Depends(require_sub_admin),
) -> OfferImageUploadResponse:
    try:
        url, fields, object_key = presign_banner_image_upload(
            payload.content_type, payload.filename
        )
    except UnsupportedImageType as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Use JPEG, PNG, or WEBP.",
        ) from exc
    return OfferImageUploadResponse(
        object_key=object_key,
        upload_url=url,
        fields=fields,
        max_bytes=IMAGE_MAX_BYTES,
    )


@router.post("", response_model=OfferRead, status_code=status.HTTP_201_CREATED)
async def create_offer(
    payload: OfferCreate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    try:
        media_asset = await resolve_campaign_asset(
            db,
            asset_id=payload.media_asset_id,
            business_line=payload.business_line,
            allowed_usage_types={"dashboard_offer", "campaign"},
        )
    except CampaignMediaInvalid as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Choose an active offer asset for this business line.",
        ) from exc
    values = payload.model_dump(exclude={"audience_rules"})
    if media_asset is not None:
        values["image_key"] = media_asset.image_ref
    values["audience_rules"] = audience_rules_to_storage(payload.audience_rules)
    offer = Offer(created_by_uuid=current_user.id, **values)
    db.add(offer)
    await db.flush()
    await record_audit(
        db,
        action=AuditAction.OFFER_CREATED,
        entity_type="offer",
        entity_uuid=offer.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=offer.business_line,
        detail={"status": offer.status.value},
    )
    await db.commit()
    await db.refresh(offer)
    return _read(offer)


@router.get("", response_model=OfferListResponse)
async def list_offers(
    status_filter: OfferStatus | None = None,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> OfferListResponse:
    stmt = select(Offer).where(Offer.removed_at.is_(None)).order_by(Offer.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(Offer.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return OfferListResponse(offers=[_read(row) for row in rows])


@router.get("/{offer_id}", response_model=OfferRead)
async def get_offer(
    offer_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    offer = await db.scalar(select(Offer).where(Offer.id == offer_id, Offer.removed_at.is_(None)))
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    return _read(offer)


@router.patch("/{offer_id}", response_model=OfferRead)
async def update_offer(
    offer_id: UUID,
    payload: OfferUpdate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    offer = await db.scalar(
        select(Offer).where(Offer.id == offer_id, Offer.removed_at.is_(None)).with_for_update()
    )
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    if offer.status not in _EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only draft or rejected offers can be edited.",
        )
    if payload.expected_version is not None and payload.expected_version != offer.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This campaign changed after you opened it. Refresh before saving.",
        )
    media_asset = None
    if "media_asset_id" in payload.model_fields_set:
        try:
            media_asset = await resolve_campaign_asset(
                db,
                asset_id=payload.media_asset_id,
                business_line=offer.business_line,
                allowed_usage_types={"dashboard_offer", "campaign"},
            )
        except CampaignMediaInvalid as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Choose an active offer asset for this business line.",
            ) from exc
    values = payload.model_dump(exclude_unset=True, exclude={"audience_rules", "expected_version"})
    if "audience_rules" in payload.model_fields_set and payload.audience_rules is not None:
        values["audience_rules"] = audience_rules_to_storage(payload.audience_rules)
    if "media_asset_id" in payload.model_fields_set:
        values["image_key"] = media_asset.image_ref if media_asset else None
    for field, value in values.items():
        setattr(offer, field, value)
    if offer.discount_type == "percentage" and offer.discount_value > 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="discount_value cannot exceed 100 for a percentage offer.",
        )
    try:
        AudienceRules.model_validate(offer.audience_rules)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This offer has invalid audience rules.",
        ) from exc
    await record_audit(
        db,
        action=AuditAction.OFFER_UPDATED,
        entity_type="offer",
        entity_uuid=offer.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=offer.business_line,
        detail={"fields": sorted(values)},
    )
    offer.version += 1
    await db.commit()
    await db.refresh(offer)
    return _read(offer)


async def _transition(
    offer_id: UUID,
    target: OfferStatus,
    current_user: CurrentUser,
    db: AsyncSession,
    *,
    review_note: str | None = None,
) -> OfferRead:
    try:
        offer = await transition_offer(
            offer_id,
            current_user.id,
            current_user.role,
            target,
            db,
            review_note=review_note,
        )
    except OfferIllegalTransition as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This offer cannot move to that status from its current status.",
        ) from exc
    except OfferInvalidConfiguration as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Add a partner, HTTPS destination, coupon code, artwork, terms, and at least "
                "one audience role before review or activation."
            ),
        ) from exc
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    return _read(offer)


@router.post("/{offer_id}/submit", response_model=OfferRead)
async def submit(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _transition(offer_id, OfferStatus.PENDING_APPROVAL, current_user, db)


@router.post("/{offer_id}/approve", response_model=OfferRead)
async def approve(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _transition(offer_id, OfferStatus.APPROVED, current_user, db)


@router.post("/{offer_id}/reject", response_model=OfferRead)
async def reject(
    offer_id: UUID,
    payload: OfferRejectRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _transition(
        offer_id, OfferStatus.REJECTED, current_user, db, review_note=payload.note
    )


@router.post("/{offer_id}/schedule", response_model=OfferRead)
async def schedule(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _transition(offer_id, OfferStatus.SCHEDULED, current_user, db)


@router.post("/{offer_id}/activate", response_model=OfferRead)
async def activate(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _transition(offer_id, OfferStatus.ACTIVE, current_user, db)


@router.post("/{offer_id}/archive", response_model=OfferRead)
async def archive(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _transition(offer_id, OfferStatus.ARCHIVED, current_user, db)


@router.delete("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer_draft(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    offer = await db.scalar(
        select(Offer).where(Offer.id == offer_id, Offer.removed_at.is_(None)).with_for_update()
    )
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    if offer.status != OfferStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a never-submitted draft can be deleted.",
        )
    await record_audit(
        db,
        action=AuditAction.OFFER_DELETED,
        entity_type="offer",
        entity_uuid=offer.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=offer.business_line,
        detail={"mode": "draft_delete"},
    )
    await db.delete(offer)
    await db.commit()


@router.post("/{offer_id}/remove", response_model=OfferRead)
async def remove(
    offer_id: UUID,
    payload: OfferRejectRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    offer = await remove_offer(offer_id, current_user.id, payload.note, db)
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    return _read(offer)
