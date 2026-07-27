"""Public property catalog router (docs/specs/public-property-catalog.md).

Unauthenticated, mirroring api/v1/leads.py's shape: no auth dependency at all,
so the request never enters get_current_user and never sets an RLS session
context. This module only ever gets a `Depends(get_db)` request session (no
bypass superuser session needed for a read); services.public_catalog's
`active` filter is what stands in for RLS here — see that module's docstring.

A separate `/api/v1/public` prefix, not a route added to properties.py:
properties.py's docstring states RLS is the access boundary there, which an
anonymous sibling route would silently falsify. This module is the home for
every future anonymous read (banner/offer/content serving included).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.banners import PublicBannerListResponse, PublicBannerRead
from app.schemas.offers import PublicOfferListResponse, PublicOfferRead
from app.schemas.properties import PublicPropertyListResponse, PublicPropertyRead
from app.services.public_catalog import (
    list_public_banners,
    list_public_offers,
    list_public_properties,
)

router = APIRouter()


@router.get("/properties", response_model=PublicPropertyListResponse)
async def list_properties_public(
    db: AsyncSession = Depends(get_db),
) -> PublicPropertyListResponse:
    properties = await list_public_properties(db)
    return PublicPropertyListResponse(
        properties=[PublicPropertyRead.model_validate(p, from_attributes=True) for p in properties]
    )


@router.get("/banners", response_model=PublicBannerListResponse)
async def list_banners_public(
    db: AsyncSession = Depends(get_db),
) -> PublicBannerListResponse:
    banners = await list_public_banners(db)
    return PublicBannerListResponse(
        banners=[PublicBannerRead.model_validate(b, from_attributes=True) for b in banners]
    )


@router.get("/offers", response_model=PublicOfferListResponse)
async def list_offers_public(
    db: AsyncSession = Depends(get_db),
) -> PublicOfferListResponse:
    offers = await list_public_offers(db)
    return PublicOfferListResponse(
        offers=[PublicOfferRead.model_validate(o, from_attributes=True) for o in offers]
    )
