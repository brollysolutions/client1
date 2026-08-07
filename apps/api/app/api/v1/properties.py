"""Real-estate property catalog — read-only browse + detail.

RLS (migration bf2c3d4e5a6b) is the access boundary: every authenticated user
sees `active` listings; platform Admin/Sub Admin also see inactive ones. This
router only authenticates and shapes the response; it does not filter — the
catalog is small and all search/filter/sort runs client-side on the full active
set. Listing creation is out of scope (a later Admin-approval workflow slice);
there is no write endpoint here and only SELECT is granted to api_user.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.property import Property
from app.schemas.properties import PropertyListResponse, PropertyRead
from app.services.properties import media_urls_by_property

router = APIRouter()


@router.get("", response_model=PropertyListResponse)
async def list_properties(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> PropertyListResponse:
    # Unfiltered select — RLS scopes it (active-only for clients/staff, all for
    # admin). created_at ASC keeps the seeded catalog in its curated order so the
    # client-side "Featured" strip stays stable.
    result = await db.execute(select(Property).order_by(Property.created_at.asc(), Property.id))
    properties = result.scalars().all()
    media = await media_urls_by_property(db, [property.id for property in properties])
    return PropertyListResponse(
        properties=[
            PropertyRead.model_validate(p, from_attributes=True).model_copy(
                update={"media_urls": media[p.id]}
            )
            for p in properties
        ]
    )


@router.get("/{property_id}", response_model=PropertyRead)
async def get_property(
    property_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> PropertyRead:
    prop = await db.scalar(select(Property).where(Property.id == property_id))
    if prop is None:
        # 404, never 403: an RLS-filtered (inactive, non-admin) row must be
        # indistinguishable from one that does not exist.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found.")
    media = await media_urls_by_property(db, [prop.id])
    return PropertyRead.model_validate(prop, from_attributes=True).model_copy(
        update={"media_urls": media[prop.id]}
    )
