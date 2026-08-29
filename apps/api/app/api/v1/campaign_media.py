"""Sub Admin campaign Media Library; Admin has read-only preview access."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    CurrentUser,
    require_sub_admin,
)
from app.db.session import get_db
from app.models.campaign_media import CampaignMediaAsset
from app.schemas.campaign_media import (
    CampaignMediaCreate,
    CampaignMediaListResponse,
    CampaignMediaRead,
    CampaignMediaUpdate,
    CampaignMediaUploadRequest,
    CampaignMediaUploadResponse,
    CampaignMediaUsageType,
)
from app.services.campaign_media import (
    MEDIA_MAX_BYTES,
    CampaignMediaInUse,
    CampaignMediaInvalid,
    create_asset,
    delete_asset,
    presign_campaign_media,
    read_asset,
    update_asset,
    usage_counts,
)

router = APIRouter()


@router.post("/image-upload-url", response_model=CampaignMediaUploadResponse)
async def image_upload_url(
    payload: CampaignMediaUploadRequest,
    current_user: CurrentUser = Depends(require_sub_admin),
) -> CampaignMediaUploadResponse:
    try:
        url, fields, object_key = presign_campaign_media(payload.content_type, payload.filename)
    except CampaignMediaInvalid as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported campaign image. Use JPEG, PNG, or WEBP.",
        ) from exc
    return CampaignMediaUploadResponse(
        object_key=object_key,
        upload_url=url,
        fields=fields,
        max_bytes=MEDIA_MAX_BYTES,
    )


@router.post("", response_model=CampaignMediaRead, status_code=status.HTTP_201_CREATED)
async def confirm_media(
    payload: CampaignMediaCreate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignMediaRead:
    try:
        asset = await create_asset(
            db, payload=payload, actor_uuid=current_user.id, actor_role=current_user.role
        )
        return await read_asset(db, asset)
    except CampaignMediaInvalid as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Upload a valid landscape campaign image with the required placement dimensions."
            ),
        ) from exc


@router.get("", response_model=CampaignMediaListResponse)
async def list_media(
    active_only: bool = False,
    usage_type: CampaignMediaUsageType | None = None,
    business_line: Literal["loans", "real_estate", "both"] | None = None,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignMediaListResponse:
    stmt = select(CampaignMediaAsset).order_by(CampaignMediaAsset.created_at.desc())
    if active_only:
        stmt = stmt.where(CampaignMediaAsset.active.is_(True))
    if usage_type:
        stmt = stmt.where(CampaignMediaAsset.usage_type == usage_type)
    if business_line:
        stmt = stmt.where(
            CampaignMediaAsset.business_line == business_line
            if business_line == "both"
            else CampaignMediaAsset.business_line.in_((business_line, "both"))
        )
    assets = (await db.scalars(stmt)).all()
    counts = await usage_counts(db, [item.id for item in assets])
    return CampaignMediaListResponse(
        assets=[await read_asset(db, item, usage_count=counts.get(item.id, 0)) for item in assets]
    )


@router.get("/{asset_id}", response_model=CampaignMediaRead)
async def get_media(
    asset_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignMediaRead:
    asset = await db.get(CampaignMediaAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")
    return await read_asset(db, asset)


@router.patch("/{asset_id}", response_model=CampaignMediaRead)
async def patch_media(
    asset_id: UUID,
    payload: CampaignMediaUpdate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignMediaRead:
    asset = await db.scalar(
        select(CampaignMediaAsset).where(CampaignMediaAsset.id == asset_id).with_for_update()
    )
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")
    updated = await update_asset(
        db,
        asset=asset,
        payload=payload,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
    )
    return await read_asset(db, updated)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_media(
    asset_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    asset = await db.scalar(
        select(CampaignMediaAsset).where(CampaignMediaAsset.id == asset_id).with_for_update()
    )
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")
    try:
        await delete_asset(
            db, asset=asset, actor_uuid=current_user.id, actor_role=current_user.role
        )
    except CampaignMediaInUse as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This artwork is still used by a banner, offer, or governed template.",
        ) from exc
