"""Real-estate property catalog — read-only browse + detail.

RLS (migration bf2c3d4e5a6b) is the access boundary: every authenticated user
sees `active` listings; platform Admin/Sub Admin also see inactive ones. This
router only authenticates and shapes the response; it does not filter — the
catalog is small and all search/filter/sort runs client-side on the full active
set. Listing creation is out of scope (a later Admin-approval workflow slice);
there is no write endpoint here and only SELECT is granted to api_user.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user, require_platform_admin
from app.db.session import get_db
from app.models.audit_log import AuditAction
from app.models.property import Property
from app.schemas.properties import AdminPropertyStatusUpdate, PropertyListResponse, PropertyRead
from app.schemas.property_details import PropertyStructuredDetails
from app.services.audit_log import record as record_audit
from app.services.properties import media_by_property, media_urls_by_property

router = APIRouter()
logger = logging.getLogger(__name__)
_PROPERTY_DETAILS_ADAPTER = TypeAdapter(PropertyStructuredDetails)


def _property_data(prop: Property) -> dict:
    """Project an ORM row while containing malformed legacy detail JSON.

    Mirrors app/api/v1/public_catalog.py's _public_property_data, which this
    authenticated catalog lacked: one stale row (structured_details that
    predates a since-tightened field requirement, e.g. a legacy
    project_residence row missing its now-required amenities_description)
    must not 500 the whole dashboard catalog for every Client/Agent/staff
    user. The typed common facts remain safe to serve and the invalid detail
    block is omitted with an identifier-only warning for repair.
    """
    structured_details = prop.structured_details
    if structured_details is not None:
        try:
            structured_details = _PROPERTY_DETAILS_ADAPTER.validate_python(structured_details)
        except ValidationError:
            logger.warning("property.invalid_structured_details property_id=%s", prop.id)
            structured_details = None
    return {**prop.__dict__, "structured_details": structured_details}


async def _to_read(db: AsyncSession, prop: Property) -> PropertyRead:
    media = await media_urls_by_property(db, [prop.id])
    media_items = await media_by_property(db, [prop.id])
    return PropertyRead.model_validate(_property_data(prop)).model_copy(
        update={"media_urls": media[prop.id], "media": media_items[prop.id]}
    )


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
    media_items = await media_by_property(db, [property.id for property in properties])
    return PropertyListResponse(
        properties=[
            PropertyRead.model_validate(_property_data(p)).model_copy(
                update={"media_urls": media[p.id], "media": media_items[p.id]}
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
    return await _to_read(db, prop)


@router.patch("/{property_id}/status", response_model=PropertyRead)
async def update_property_status(
    property_id: UUID,
    payload: AdminPropertyStatusUpdate,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> PropertyRead:
    prop = await db.scalar(select(Property).where(Property.id == property_id).with_for_update())
    if prop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found.")
    if prop.active != payload.active:
        previous_active = prop.active
        prop.active = payload.active
        await record_audit(
            db,
            action=AuditAction.PROPERTY_LISTING_UPDATED,
            entity_type="property",
            entity_uuid=prop.id,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
            business_line=prop.business_line,
            detail={
                "previous_active": previous_active,
                "active": payload.active,
                "reason": payload.reason,
            },
        )
        await db.commit()
        await db.refresh(prop)
    return await _to_read(db, prop)
