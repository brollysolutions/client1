"""Banners — Sub Admin create/edit/submit + Admin approve/reject.

Create/edit/submit run on the request session under RLS (narrow sub_admin-only
allowlist — migration a4b5c6d7e8f9). Approve/reject delegate to the bypass
service so the status flip is atomic and api_user never needs an UPDATE path for
the approval transition itself.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user, require_admin, require_sub_admin
from app.db.session import get_db
from app.models.banner import Banner, BannerStatus
from app.schemas.banners import (
    BannerCreate,
    BannerImageUploadRequest,
    BannerImageUploadResponse,
    BannerListResponse,
    BannerRead,
    BannerUpdate,
    RejectRequest,
)
from app.services.banners import (
    IMAGE_MAX_BYTES,
    BannerAlreadyReviewed,
    BannerNotOwned,
    UnsupportedImageType,
    approve_banner,
    presign_banner_image_upload,
    reject_banner,
    submit_banner,
)

router = APIRouter()


@router.post("", response_model=BannerRead, status_code=status.HTTP_201_CREATED)
async def create_banner(
    payload: BannerCreate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    banner = Banner(created_by_uuid=current_user.id, **payload.model_dump())
    db.add(banner)
    await db.commit()
    await db.refresh(banner)
    return BannerRead.model_validate(banner, from_attributes=True)


@router.post("/image-upload-url", response_model=BannerImageUploadResponse)
async def get_banner_image_upload_url(
    payload: BannerImageUploadRequest,
    current_user: CurrentUser = Depends(require_sub_admin),
) -> BannerImageUploadResponse:
    # No DB row yet -- a banner may not exist until after the image is
    # picked (create_banner takes image_key as a plain field). The key
    # itself is the only thing that needs to exist ahead of time.
    try:
        url, fields, object_key = presign_banner_image_upload(
            payload.content_type, payload.filename
        )
    except UnsupportedImageType as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Use JPEG, PNG, or WEBP.",
        ) from exc
    return BannerImageUploadResponse(
        object_key=object_key,
        upload_url=url,
        fields=fields,
        max_bytes=IMAGE_MAX_BYTES,
    )


@router.get("", response_model=BannerListResponse)
async def list_banners(
    status_filter: BannerStatus | None = None,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> BannerListResponse:
    # RLS scopes the rows: sub_admin and admin see the shared queue, anyone else
    # sees nothing. Newest first.
    stmt = select(Banner).order_by(Banner.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(Banner.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return BannerListResponse(
        banners=[BannerRead.model_validate(r, from_attributes=True) for r in rows]
    )


@router.get("/{banner_id}", response_model=BannerRead)
async def get_banner(
    banner_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    banner = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if banner is None:
        # 404, never 403: an RLS-filtered row is indistinguishable from missing.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    return BannerRead.model_validate(banner, from_attributes=True)


@router.patch("/{banner_id}", response_model=BannerRead)
async def update_banner(
    banner_id: UUID,
    payload: BannerUpdate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    banner = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    # App-layer guard against a silent no-op: RLS's banners_update policy only
    # matches own-row + draft/rejected, but sub_admin's SELECT grant sees every
    # banner (shared queue) — without this check a mismatched UPDATE would zero-
    # row no-op and this endpoint would report false success. Ownership and
    # status are reported as distinct errors (403 vs 409) so the frontend, which
    # has no way to check ownership client-side (session carries role only, not
    # user id), can show the right message from a failed optimistic attempt.
    if banner.created_by_uuid != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit banners you created.",
        )
    if banner.status not in (BannerStatus.DRAFT, BannerStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This banner cannot be edited from its current status.",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(banner, field, value)
    await db.commit()
    await db.refresh(banner)
    return BannerRead.model_validate(banner, from_attributes=True)


@router.post("/{banner_id}/submit", response_model=BannerRead)
async def submit(
    banner_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    try:
        banner = await submit_banner(banner_id, current_user.id, db)
    except BannerNotOwned as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only submit banners you created.",
        ) from exc
    except BannerAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This banner cannot be submitted from its current status.",
        ) from exc
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    return BannerRead.model_validate(banner, from_attributes=True)


@router.post("/{banner_id}/approve", response_model=BannerRead)
async def approve(
    banner_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    try:
        banner = await approve_banner(banner_id, current_user.id)
    except BannerAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This banner has already been reviewed.",
        ) from exc
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    return BannerRead.model_validate(banner, from_attributes=True)


@router.post("/{banner_id}/reject", response_model=BannerRead)
async def reject(
    banner_id: UUID,
    payload: RejectRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    try:
        banner = await reject_banner(banner_id, current_user.id, payload.note)
    except BannerAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This banner has already been reviewed.",
        ) from exc
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    return BannerRead.model_validate(banner, from_attributes=True)
