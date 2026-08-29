"""Authenticated, private/no-store dashboard marketing placements."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import (
    TTL_PERSONALIZATION_LOCATION_CAPTURE,
    RedisCache,
    personalization_location_capture_key,
)
from app.core.client_ip import get_client_ip
from app.core.deps import CurrentUser, get_active_user, get_cache
from app.db.session import get_db
from app.schemas.personalization import (
    AuthenticatedBannerRead,
    AuthenticatedOfferRead,
    AuthenticatedPlacementResponse,
    LocationCaptureRequest,
    PersonalizationPreferenceRead,
    PersonalizationPreferenceUpdate,
)
from app.services import personalization
from app.services.campaign_media import asset_image_url

router = APIRouter()


async def require_personalization_viewer(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    if current_user.role not in ("client", "agent", "employee", "telecaller"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dashboard placements are available to Dhanadhara user accounts only.",
        )
    return current_user


def _private_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "Authorization"


@router.get("/preferences", response_model=PersonalizationPreferenceRead)
async def get_preferences(
    response: Response,
    current_user: CurrentUser = Depends(require_personalization_viewer),
    db: AsyncSession = Depends(get_db),
) -> PersonalizationPreferenceRead:
    _private_no_store(response)
    preference = await personalization.get_preference(db, current_user.id)
    return PersonalizationPreferenceRead(**personalization.preference_read_values(preference))


@router.patch("/preferences", response_model=PersonalizationPreferenceRead)
async def update_preferences(
    payload: PersonalizationPreferenceUpdate,
    request: Request,
    response: Response,
    current_user: CurrentUser = Depends(require_personalization_viewer),
    db: AsyncSession = Depends(get_db),
) -> PersonalizationPreferenceRead:
    preference = await personalization.set_personalization_consent(
        db,
        auth_user_uuid=current_user.id,
        enabled=payload.personalization_enabled,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _private_no_store(response)
    return PersonalizationPreferenceRead(**personalization.preference_read_values(preference))


@router.put("/location", response_model=PersonalizationPreferenceRead)
async def put_location(
    payload: LocationCaptureRequest,
    request: Request,
    response: Response,
    current_user: CurrentUser = Depends(require_personalization_viewer),
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> PersonalizationPreferenceRead:
    existing = await personalization.get_preference(db, current_user.id)
    if existing is None or not existing.personalization_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enable personalized content before enabling location.",
        )
    count = await cache.incr_with_expire(
        personalization_location_capture_key(str(current_user.id)),
        TTL_PERSONALIZATION_LOCATION_CAPTURE,
    )
    if count > personalization.LOCATION_CAPTURE_LIMIT_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many location refreshes. Try again later.",
        )
    try:
        preference = await personalization.capture_location(
            db,
            auth_user_uuid=current_user.id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except personalization.PersonalizationConsentRequired as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enable personalized content before enabling location.",
        ) from exc
    _private_no_store(response)
    return PersonalizationPreferenceRead(**personalization.preference_read_values(preference))


@router.delete("/location", response_model=PersonalizationPreferenceRead)
async def delete_location(
    request: Request,
    response: Response,
    current_user: CurrentUser = Depends(require_personalization_viewer),
    db: AsyncSession = Depends(get_db),
) -> PersonalizationPreferenceRead:
    preference = await personalization.revoke_location(
        db,
        auth_user_uuid=current_user.id,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _private_no_store(response)
    return PersonalizationPreferenceRead(**personalization.preference_read_values(preference))


@router.get("/placements", response_model=AuthenticatedPlacementResponse)
async def get_placements(
    business_line: Literal["loans", "real_estate"],
    response: Response,
    current_user: CurrentUser = Depends(require_personalization_viewer),
    db: AsyncSession = Depends(get_db),
) -> AuthenticatedPlacementResponse:
    try:
        banners, offers = await personalization.list_authenticated_placements(
            db, current_user, business_line
        )
    except personalization.PlacementLineNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard line not found.",
        ) from exc
    _private_no_store(response)
    return AuthenticatedPlacementResponse(
        banners=[
            AuthenticatedBannerRead(
                id=banner.id,
                banner_type=banner.banner_type,
                title=banner.title,
                subtitle=banner.subtitle,
                cta_label=banner.cta_label,
                deep_link=banner.deep_link,
                image_url=asset_image_url(banner.image_key) if banner.image_key else None,
            )
            for banner in banners
        ],
        offers=[
            AuthenticatedOfferRead(
                id=offer.id,
                title=offer.title,
                description=offer.description,
                discount_type=offer.discount_type,
                discount_value=offer.discount_value,
                code=offer.code,
                partner_name=offer.partner_name or "",
                redemption_url=offer.redemption_url or "",
                terms_summary=offer.terms_summary or "",
                terms_url=offer.terms_url,
                image_url=asset_image_url(offer.image_key) or "",
            )
            for offer in offers
        ],
    )
