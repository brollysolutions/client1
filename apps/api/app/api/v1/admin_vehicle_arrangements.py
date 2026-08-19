"""Platform-Admin vehicle-arrangement queue and fulfilment updates."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_platform_admin
from app.db.session import get_db
from app.models.vehicle_arrangement import VehicleArrangementStatus
from app.schemas.vehicle_arrangements import (
    VehicleArrangementAdminListResponse,
    VehicleArrangementAdminUpdate,
    VehicleArrangementStaffRead,
)
from app.services.vehicle_arrangements import (
    ArrangementDetailsRequired,
    ArrangementNotFound,
    ArrangementTerminal,
    InvalidArrangementEmployee,
    InvalidArrangementTransition,
    VehicleArrangementView,
    list_for_admin,
    update_for_admin,
)

router = APIRouter()


def _to_read(view: VehicleArrangementView) -> VehicleArrangementStaffRead:
    item, visit = view.arrangement, view.visit
    return VehicleArrangementStaffRead(
        id=item.id,
        site_visit_uuid=item.site_visit_uuid,
        property_title=visit.title,
        property_locality=visit.locality,
        property_city=visit.city,
        pickup_location=item.pickup_location,
        pickup_at=item.pickup_at,
        status=item.status,
        vehicle_make_model=item.vehicle_make_model,
        vehicle_registration=item.vehicle_registration,
        driver_name=item.driver_name,
        driver_mobile=item.driver_mobile,
        assigned_employee_profile_uuid=item.assigned_employee_profile_uuid,
        assigned_employee_name=view.employee_name,
        completed_at=item.completed_at,
        cancelled_at=item.cancelled_at,
        cancellation_reason=item.cancellation_reason,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("", response_model=VehicleArrangementAdminListResponse)
async def list_vehicle_arrangements(
    status_filter: VehicleArrangementStatus | None = None,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> VehicleArrangementAdminListResponse:
    del current_user
    return VehicleArrangementAdminListResponse(
        arrangements=[_to_read(view) for view in await list_for_admin(db, status_filter)]
    )


@router.patch("/{arrangement_id}", response_model=VehicleArrangementStaffRead)
async def patch_vehicle_arrangement(
    arrangement_id: UUID,
    payload: VehicleArrangementAdminUpdate,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> VehicleArrangementStaffRead:
    try:
        return _to_read(await update_for_admin(db, arrangement_id, payload, current_user))
    except ArrangementNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle arrangement not found.") from exc
    except ArrangementTerminal as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This arrangement is already closed."
        ) from exc
    except InvalidArrangementTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "This status change is not allowed.") from exc
    except ArrangementDetailsRequired as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Vehicle and driver details are required for this status.",
        ) from exc
    except InvalidArrangementEmployee as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "The assignee must be an active real-estate Employee.",
        ) from exc
