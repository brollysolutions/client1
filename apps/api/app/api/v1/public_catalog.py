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

from decimal import Decimal
from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.banner import BannerPlacement
from app.models.offer import Offer
from app.models.property import Property, ReraVerificationStatus
from app.schemas.banners import PublicBannerListResponse, PublicBannerRead
from app.schemas.content import PublicContentBlockListResponse, PublicContentBlockRead
from app.schemas.financial_catalog import (
    ProviderOfferSort,
    ProviderType,
    PublicFinancialProductListResponse,
    PublicFinancialProductRead,
    PublicProviderOfferListResponse,
    PublicProviderOfferRead,
    PublicProviderRead,
)
from app.schemas.financial_products import ProductCategory
from app.schemas.offers import PublicOfferListResponse, PublicOfferRead
from app.schemas.properties import PublicPropertyListResponse, PublicPropertyRead
from app.services import storage
from app.services.banners import template_image_url
from app.services.financial_catalog import (
    get_public_product,
    list_public_products,
    list_public_provider_offers,
    provider_logo_url,
)
from app.services.properties import media_by_property, media_urls_by_property
from app.services.public_catalog import (
    get_public_content_block_by_slug,
    list_public_banners,
    list_public_content_blocks,
    list_public_offers,
    list_public_properties,
)

router = APIRouter()


def _public_product_read(product, provider_count: int) -> PublicFinancialProductRead:  # noqa: ANN001
    return PublicFinancialProductRead(
        id=product.id,
        slug=product.name,
        label=product.label,
        category=product.category,
        summary=product.public_summary,
        description=product.public_description,
        highlights=product.public_highlights,
        eligibility=product.public_eligibility,
        documents=product.public_documents,
        faq=product.public_faq,
        homepage_featured=product.homepage_featured,
        provider_count=provider_count,
        updated_at=product.updated_at,
    )


@router.get("/financial-products", response_model=PublicFinancialProductListResponse)
async def list_financial_products_public(
    q: str | None = Query(default=None, min_length=1, max_length=100),
    category: ProductCategory | None = None,
    featured: bool | None = None,
    page: int = Query(default=1, ge=1, le=10000),
    page_size: int = Query(default=12, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PublicFinancialProductListResponse:
    rows, total = await list_public_products(
        db,
        query=q,
        category=category.value if category is not None else None,
        featured=featured,
        page=page,
        page_size=page_size,
    )
    return PublicFinancialProductListResponse(
        items=[_public_product_read(product, count) for product, count in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/financial-products/{slug}", response_model=PublicFinancialProductRead)
async def get_financial_product_public(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PublicFinancialProductRead:
    row = await get_public_product(db, slug)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial product not found.")
    return _public_product_read(*row)


@router.get(
    "/financial-products/{slug}/providers",
    response_model=PublicProviderOfferListResponse,
)
async def list_financial_product_providers_public(
    slug: str,
    q: str | None = Query(default=None, min_length=1, max_length=100),
    provider_type: ProviderType | None = None,
    amount: Decimal | None = Query(default=None, ge=0, le=99_999_999_999),
    interest_rate_max: Decimal | None = Query(default=None, ge=0, le=100),
    tenure_months: int | None = Query(default=None, ge=1, le=600),
    sort: ProviderOfferSort = "recommended",
    page: int = Query(default=1, ge=1, le=10000),
    page_size: int = Query(default=12, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PublicProviderOfferListResponse:
    product_row = await get_public_product(db, slug)
    if product_row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial product not found.")
    product, _ = product_row
    rows, total = await list_public_provider_offers(
        db,
        product=product,
        query=q,
        provider_type=provider_type.value if provider_type is not None else None,
        amount=amount,
        interest_rate_max=interest_rate_max,
        tenure_months=tenure_months,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return PublicProviderOfferListResponse(
        items=[
            PublicProviderOfferRead(
                id=offer.id,
                offer_name=offer.offer_name,
                summary=offer.summary,
                provider=PublicProviderRead(
                    id=provider.id,
                    name=provider.name,
                    legal_name=provider.legal_name,
                    provider_type=provider.provider_type,
                    logo_url=(
                        provider_logo_url(provider.logo_key)
                        if provider.logo_verified_at is not None
                        else None
                    ),
                ),
                min_amount=offer.min_amount,
                max_amount=offer.max_amount,
                min_interest_rate=offer.min_interest_rate,
                max_interest_rate=offer.max_interest_rate,
                min_tenure_months=offer.min_tenure_months,
                max_tenure_months=offer.max_tenure_months,
                processing_fee_text=offer.processing_fee_text,
                eligibility_summary=offer.eligibility_summary,
                last_verified_at=offer.last_verified_at,
            )
            for offer, provider in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


def _offer_badge(offer: Offer) -> str:
    value = format(offer.discount_value, "f")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    discount_type = offer.discount_type
    discount = (
        f"{value}% off"
        if discount_type == "percentage"
        else "Cashback offer"
        if discount_type == "cashback-tie"
        else f"₹{value} off"
    )
    return f"{offer.title} · {discount}" + (f" · Code {offer.code}" if offer.code else "")


def _property_enquiry_href(property_listing: Property) -> str:
    product = f"{property_listing.title}, {property_listing.location}"[:120]
    return f"/contact?{urlencode({'line': 'real_estate', 'product': product})}"


@router.get("/properties", response_model=PublicPropertyListResponse)
async def list_properties_public(
    db: AsyncSession = Depends(get_db),
) -> PublicPropertyListResponse:
    properties = await list_public_properties(db)
    media = await media_urls_by_property(db, [property.id for property in properties])
    media_items = await media_by_property(db, [property.id for property in properties])
    return PublicPropertyListResponse(
        properties=[
            PublicPropertyRead.model_validate(p, from_attributes=True).model_copy(
                update={
                    "media_urls": media[p.id],
                    "media": media_items[p.id],
                    "rera_number": (
                        p.rera_number
                        if p.rera_verification_status == ReraVerificationStatus.VERIFIED
                        else None
                    ),
                }
            )
            for p in properties
        ]
    )


@router.get("/banners", response_model=PublicBannerListResponse)
async def list_banners_public(
    placement: Literal["homepage", "homepage_ad", "financial_services", "properties"] = "homepage",
    db: AsyncSession = Depends(get_db),
) -> PublicBannerListResponse:
    banners = await list_public_banners(db, BannerPlacement(placement))
    linked_property_ids = [
        property_listing.id for _, _, _, property_listing in banners if property_listing is not None
    ]
    property_media = await media_urls_by_property(db, linked_property_ids)
    # Not a blind model_validate like the other three list routes below:
    # image_url isn't a column, it's computed from image_key through
    # storage.public_asset_url (None for anything outside public/ -- see that
    # function's docstring). image_key itself never reaches PublicBannerRead.
    response: list[PublicBannerRead] = []
    for banner, template, offer, property_listing in banners:
        template_url = (
            template_image_url(template.image_ref, version=template.version)
            if template is not None
            else None
        )
        linked_media = property_media.get(property_listing.id, []) if property_listing else []
        response.append(
            PublicBannerRead(
                id=banner.id,
                title=banner.title,
                subtitle=banner.subtitle,
                cta_label=(
                    (banner.cta_label or "Enquire now") if property_listing else banner.cta_label
                ),
                deep_link=(
                    _property_enquiry_href(property_listing)
                    if property_listing is not None
                    else banner.deep_link
                ),
                image_url=(
                    template_url
                    if property_listing is not None
                    and banner.placement == BannerPlacement.PROPERTIES
                    and template_url is not None
                    else linked_media[0]
                    if linked_media
                    else template_url
                    if template_url is not None
                    else storage.public_asset_url(banner.image_key)
                    if banner.image_key
                    else None
                ),
                offer_badge=_offer_badge(offer) if offer is not None else None,
                rera_verified=bool(
                    property_listing is not None
                    and property_listing.rera_verification_status == ReraVerificationStatus.VERIFIED
                ),
            )
        )
    return PublicBannerListResponse(banners=response)


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
