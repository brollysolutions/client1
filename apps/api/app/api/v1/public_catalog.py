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

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.banners import PublicBannerListResponse, PublicBannerRead
from app.schemas.content import PublicContentBlockListResponse, PublicContentBlockRead
from app.schemas.offers import PublicOfferListResponse, PublicOfferRead
from app.schemas.properties import PublicPropertyListResponse, PublicPropertyRead
from app.services import storage
from app.services.public_catalog import (
    get_public_content_block_by_slug,
    list_public_banners,
    list_public_content_blocks,
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
    # Not a blind model_validate like the other three list routes below:
    # image_url isn't a column, it's computed from image_key through
    # storage.public_asset_url (None for anything outside public/ -- see that
    # function's docstring). image_key itself never reaches PublicBannerRead.
    return PublicBannerListResponse(
        banners=[
            PublicBannerRead(
                id=b.id,
                title=b.title,
                subtitle=b.subtitle,
                cta_label=b.cta_label,
                deep_link=b.deep_link,
                image_url=storage.public_asset_url(b.image_key) if b.image_key else None,
            )
            for b in banners
        ]
    )


@router.get("/offers", response_model=PublicOfferListResponse)
async def list_offers_public(
    db: AsyncSession = Depends(get_db),
) -> PublicOfferListResponse:
    offers = await list_public_offers(db)
    return PublicOfferListResponse(
        offers=[PublicOfferRead.model_validate(o, from_attributes=True) for o in offers]
    )


@router.get("/content-blocks", response_model=PublicContentBlockListResponse)
async def list_content_blocks_public(
    db: AsyncSession = Depends(get_db),
) -> PublicContentBlockListResponse:
    blocks = await list_public_content_blocks(db)
    return PublicContentBlockListResponse(
        content_blocks=[
            PublicContentBlockRead.model_validate(b, from_attributes=True) for b in blocks
        ]
    )


@router.get("/content-blocks/{slug}", response_model=PublicContentBlockRead)
async def get_content_block_by_slug_public(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PublicContentBlockRead:
    """Closes feature-status.md §2-1 — a direct lookup for the one caller
    that needs exactly one block (the homepage's `homepage-closing`
    placement), removing both the over-fetch and the >50-published-blocks
    starvation cliff the list endpoint's own docstring documents."""
    block = await get_public_content_block_by_slug(db, slug)
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Content block not found."
        )
    return PublicContentBlockRead.model_validate(block, from_attributes=True)
