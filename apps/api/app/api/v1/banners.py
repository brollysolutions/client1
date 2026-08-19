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

from app.core.deps import (
    CurrentUser,
    get_active_user,
    require_admin,
    require_platform_admin,
    require_sub_admin,
    require_sub_admin_or_platform_admin,
)
from app.db.session import get_db
from app.models.audit_log import AuditAction
from app.models.banner import Banner, BannerStatus, BannerTemplate
from app.schemas.banners import (
    BannerCreate,
    BannerImageUploadRequest,
    BannerImageUploadResponse,
    BannerListResponse,
    BannerRead,
    BannerTemplateCreate,
    BannerTemplateListResponse,
    BannerTemplateRead,
    BannerUpdate,
    RejectRequest,
)
from app.schemas.personalization import (
    AudienceRules,
    audience_rules_to_storage,
    audience_rules_valid_for_banner,
)
from app.services.audit_log import record as record_audit
from app.services.banners import (
    IMAGE_MAX_BYTES,
    BannerAlreadyReviewed,
    BannerInvalidAudience,
    BannerInvalidConfiguration,
    BannerNotOwned,
    UnsupportedImageType,
    approve_banner,
    archive_banner,
    create_template_version,
    presign_banner_image_upload,
    reject_banner,
    submit_banner,
    template_image_url,
    validate_banner_configuration,
)

router = APIRouter()


@router.post("", response_model=BannerRead, status_code=status.HTTP_201_CREATED)
async def create_banner(
    payload: BannerCreate,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    try:
        template, _, _ = await validate_banner_configuration(
            db,
            placement=payload.placement,
            business_line=payload.business_line,
            template_id=payload.template_id,
            offer_id=payload.offer_id,
            property_id=payload.property_id,
            allow_legacy="placement" not in payload.model_fields_set,
        )
    except BannerInvalidConfiguration as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Banner placement, template, business line, linked Offer, or property is invalid."
            ),
        ) from exc
    values = payload.model_dump(exclude={"audience_rules"})
    values["audience_rules"] = audience_rules_to_storage(payload.audience_rules)
    values["category_key"] = template.category_key if template else None
    banner = Banner(created_by_uuid=current_user.id, **values)
    db.add(banner)
    await db.flush()
    await record_audit(
        db,
        action=AuditAction.BANNER_CREATED,
        entity_type="banner",
        entity_uuid=banner.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=banner.business_line,
        detail={"placement": banner.placement.value},
    )
    await db.commit()
    await db.refresh(banner)
    return BannerRead.model_validate(banner, from_attributes=True)


def _template_read(template: BannerTemplate) -> BannerTemplateRead:
    image_url = template_image_url(template.image_ref, version=template.version)
    if image_url is None:  # Stored rows are constrained; fail closed for legacy corruption.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Template image is invalid."
        )
    return BannerTemplateRead(
        id=template.id,
        placement=template.placement,
        category_key=template.category_key,
        label=template.label,
        version=template.version,
        image_url=image_url,
        active=template.active,
        created_at=template.created_at,
    )


@router.get("/templates", response_model=BannerTemplateListResponse)
async def list_banner_templates(
    active_only: bool = True,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerTemplateListResponse:
    stmt = select(BannerTemplate).order_by(
        BannerTemplate.placement, BannerTemplate.category_key, BannerTemplate.version.desc()
    )
    if active_only:
        stmt = stmt.where(BannerTemplate.active.is_(True))
    templates = (await db.scalars(stmt)).all()
    return BannerTemplateListResponse(templates=[_template_read(item) for item in templates])


@router.post("/templates", response_model=BannerTemplateRead, status_code=status.HTTP_201_CREATED)
async def add_banner_template_version(
    payload: BannerTemplateCreate,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerTemplateRead:
    try:
        template = await create_template_version(
            db, payload=payload, actor_uuid=current_user.id, actor_role=current_user.role
        )
    except BannerInvalidConfiguration as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown category or unsafe template image reference.",
        ) from exc
    return _template_read(template)


@router.post("/templates/image-upload-url", response_model=BannerImageUploadResponse)
async def get_template_image_upload_url(
    payload: BannerImageUploadRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
) -> BannerImageUploadResponse:
    try:
        url, fields, object_key = presign_banner_image_upload(
            payload.content_type, payload.filename, template=True
        )
    except UnsupportedImageType as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Use JPEG, PNG, or WEBP.",
        ) from exc
    return BannerImageUploadResponse(
        object_key=object_key, upload_url=url, fields=fields, max_bytes=IMAGE_MAX_BYTES
    )


@router.post("/image-upload-url", response_model=BannerImageUploadResponse)
async def get_banner_image_upload_url(
    payload: BannerImageUploadRequest,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
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
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    banner = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    # RLS and this application guard both restrict mutation to draft/rejected
    # rows. The queue is intentionally shared across the Sub Admin team, so
    # authorship is audit provenance rather than an edit-authorization boundary.
    if banner.status not in (BannerStatus.DRAFT, BannerStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This banner cannot be edited from its current status.",
        )
    prospective_template_id = (
        payload.template_id if "template_id" in payload.model_fields_set else banner.template_id
    )
    prospective_offer_id = (
        payload.offer_id if "offer_id" in payload.model_fields_set else banner.offer_id
    )
    prospective_property_id = (
        payload.property_id if "property_id" in payload.model_fields_set else banner.property_id
    )
    try:
        template, _, _ = await validate_banner_configuration(
            db,
            placement=banner.placement,
            business_line=banner.business_line,
            template_id=prospective_template_id,
            offer_id=prospective_offer_id,
            property_id=prospective_property_id,
            allow_legacy=banner.template_id is None and banner.category_key is None,
        )
    except BannerInvalidConfiguration as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Banner placement, template, business line, linked Offer, or property is invalid."
            ),
        ) from exc
    values = payload.model_dump(exclude_unset=True, exclude={"audience_rules"})
    if "audience_rules" in payload.model_fields_set and payload.audience_rules is not None:
        values["audience_rules"] = audience_rules_to_storage(payload.audience_rules)
    for field, value in values.items():
        setattr(banner, field, value)
    banner.category_key = template.category_key if template else None
    try:
        rules = AudienceRules.model_validate(banner.audience_rules)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This banner has invalid audience rules.",
        ) from exc
    if not audience_rules_valid_for_banner(banner.banner_type, rules):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Personalized banners require at least one user type."
                if banner.banner_type == "personalized"
                else "Default and action banners cannot carry audience rules."
            ),
        )
    await record_audit(
        db,
        action=AuditAction.BANNER_UPDATED,
        entity_type="banner",
        entity_uuid=banner.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=banner.business_line,
        detail={"placement": banner.placement.value},
    )
    await db.commit()
    await db.refresh(banner)
    return BannerRead.model_validate(banner, from_attributes=True)


@router.post("/{banner_id}/submit", response_model=BannerRead)
async def submit(
    banner_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    try:
        banner = await submit_banner(banner_id, current_user.id, db, can_manage_any=True)
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
    except BannerInvalidAudience as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This banner has invalid audience rules.",
        ) from exc
    except BannerInvalidConfiguration as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This banner no longer has a valid active template or Offer.",
        ) from exc
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    return BannerRead.model_validate(banner, from_attributes=True)


@router.delete("/{banner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_banner_draft(
    banner_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    banner = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    if banner.status != BannerStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a never-submitted draft can be deleted.",
        )
    await record_audit(
        db,
        action=AuditAction.BANNER_DELETED,
        entity_type="banner",
        entity_uuid=banner.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=banner.business_line,
        detail={"placement": banner.placement.value},
    )
    await db.delete(banner)
    await db.commit()


@router.post("/{banner_id}/archive", response_model=BannerRead)
async def archive(
    banner_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
) -> BannerRead:
    try:
        banner = await archive_banner(banner_id, current_user.id, current_user.role)
    except BannerAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This banner cannot be archived from its current status.",
        ) from exc
    if banner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    return BannerRead.model_validate(banner, from_attributes=True)


@router.post(
    "/{banner_id}/replacement", response_model=BannerRead, status_code=status.HTTP_201_CREATED
)
async def create_replacement(
    banner_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> BannerRead:
    source = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    if source.status not in (BannerStatus.APPROVED, BannerStatus.LIVE, BannerStatus.ARCHIVED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only reviewed banners can be used as a replacement source.",
        )
    template_id = source.template_id
    if source.category_key is not None:
        active_template = await db.scalar(
            select(BannerTemplate).where(
                BannerTemplate.placement == source.placement,
                BannerTemplate.category_key == source.category_key,
                BannerTemplate.active.is_(True),
            )
        )
        if active_template is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This category has no active template.",
            )
        template_id = active_template.id
    replacement = Banner(
        business_line=source.business_line,
        placement=source.placement,
        category_key=source.category_key,
        template_id=template_id,
        offer_id=source.offer_id,
        property_id=source.property_id,
        replaces_banner_id=source.id,
        banner_type=source.banner_type,
        title=source.title,
        subtitle=source.subtitle,
        cta_label=source.cta_label,
        image_key=source.image_key if source.template_id is None else None,
        deep_link=source.deep_link,
        audience_rules=source.audience_rules,
        priority=source.priority,
        status=BannerStatus.DRAFT,
        created_by_uuid=current_user.id,
        starts_at=None,
        ends_at=None,
    )
    db.add(replacement)
    await db.flush()
    await record_audit(
        db,
        action=AuditAction.BANNER_CREATED,
        entity_type="banner",
        entity_uuid=replacement.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=replacement.business_line,
        detail={"placement": replacement.placement.value, "replacement": True},
    )
    await db.commit()
    await db.refresh(replacement)
    return BannerRead.model_validate(replacement, from_attributes=True)


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
    except BannerInvalidAudience as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This banner has invalid audience rules.",
        ) from exc
    except BannerInvalidConfiguration as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This banner no longer has a valid active template or Offer.",
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
