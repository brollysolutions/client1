"""Sub Admin router — composed home summary (slice 5).

Single GET aggregating banners/offers/content-blocks/property-submissions/
transactions into one payload, replacing the four-to-five waterfall requests
the Slice 1-4 card-grid home would otherwise need. Every underlying query runs
on the caller's own request session under each table's existing RLS; this
router adds no bypass session.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_sub_admin
from app.db.session import get_db
from app.schemas.sub_admin import SubAdminHomeResponse
from app.services.sub_admin import get_sub_admin_home

router = APIRouter()


@router.get("/home", response_model=SubAdminHomeResponse)
async def home(
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> SubAdminHomeResponse:
    return await get_sub_admin_home(db, current_user.id)
