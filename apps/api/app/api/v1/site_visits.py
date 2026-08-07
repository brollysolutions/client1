"""Client site-visit requests — book, list own, and cancel.

Real-estate line. RLS (migration 9c1d2e3f4a5b) is the access boundary: a
client sees only their own visits; real-estate telecaller/employee/sub_admin/
agent see all real-estate-line visits; platform Admin/Sub Admin see all. The
client never supplies user_uuid/business_line/status — the router stamps
user_uuid from the authenticated identity and business_line as a literal
"real_estate" (this table exists for the real-estate line only).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.notification import NotificationType
from app.models.site_visit import SiteVisit
from app.models.vehicle_arrangement import VehicleArrangementStatus
from app.schemas.site_visits import SiteVisitCreate, SiteVisitListResponse, SiteVisitRead
from app.services.notifications import emit_notification
from app.services.site_visits import (
    cancel_site_visit,
)
from app.services.site_visits import (
    create_site_visit as create_site_visit_record,
)
from app.services.site_visits import (
    list_site_visits as list_site_visit_records,
)

router = APIRouter()


def _to_read(visit: SiteVisit) -> SiteVisitRead:
    result = SiteVisitRead.model_validate(visit, from_attributes=True)
    arrangement = result.vehicle_arrangement
    if arrangement is not None and arrangement.status not in {
        VehicleArrangementStatus.ASSIGNED,
        VehicleArrangementStatus.COMPLETED,
    }:
        result.vehicle_arrangement = arrangement.model_copy(
            update={
                "vehicle_make_model": None,
                "vehicle_registration": None,
                "driver_name": None,
                "driver_mobile": None,
            }
        )
    return result


def _require_client(current_user: CurrentUser) -> None:
    # Booking/cancelling a visit is client self-service only. RLS's staff/agent
    # branch exists for read visibility (list), not for staff to act as the
    # owner of someone else's visit — that write path has no product design or
    # test coverage yet, so it's blocked here rather than left to RLS alone.
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can book or cancel a site visit.",
        )


@router.get("", response_model=SiteVisitListResponse)
async def list_site_visits(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> SiteVisitListResponse:
    visits = await list_site_visit_records(db)
    return SiteVisitListResponse(visits=[_to_read(visit) for visit in visits])


@router.post("", response_model=SiteVisitRead, status_code=status.HTTP_201_CREATED)
async def create_site_visit(
    req: SiteVisitCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> SiteVisitRead:
    _require_client(current_user)
    visit = await create_site_visit_record(db, req, current_user)
    await emit_notification(
        user_uuid=current_user.id,
        notification_type=NotificationType.SITE_VISIT_REQUESTED,
        title="Site visit requested",
        body=(
            f"We've received your request to visit {visit.title}. "
            "We'll confirm a time with you soon."
        ),
        href="/dashboard/site-visits",
    )
    return _to_read(visit)


@router.patch("/{visit_id}/cancel", response_model=SiteVisitRead)
async def cancel_site_visit_endpoint(
    visit_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> SiteVisitRead:
    _require_client(current_user)
    visit = await cancel_site_visit(db, visit_id, current_user)
    return _to_read(visit)
