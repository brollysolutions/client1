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
from app.schemas.properties import PublicPropertyListResponse, PublicPropertyRead
from app.services.public_catalog import list_public_properties

router = APIRouter()


@router.get("/properties", response_model=PublicPropertyListResponse)
async def list_properties_public(
    db: AsyncSession = Depends(get_db),
) -> PublicPropertyListResponse:
    properties = await list_public_properties(db)
    return PublicPropertyListResponse(
        properties=[PublicPropertyRead.model_validate(p, from_attributes=True) for p in properties]
    )
