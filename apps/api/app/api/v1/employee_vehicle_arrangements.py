"""Assigned Employee vehicle-arrangement queue and terminal updates."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_employee
from app.db.session import get_db
from app.models.vehicle_arrangement import VehicleArrangementStatus
from app.schemas.vehicle_arrangements import (
    VehicleArrangementEmployeeUpdate,
    VehicleArrangementStaffRead,
)
from app.services.vehicle_arrangements import (
    ArrangementDetailsRequired,
    ArrangementNotFound,
    ArrangementTerminal,
    InvalidArrangementEmployee,
    InvalidArrangementTransition,
    VehicleArrangementView,
    list_for_employee,
    update_for_employee,
)

router = APIRouter()


def _profile_id(current_user: CurrentUser) -> UUID:
    if current_user.staff_profile_uuid is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No staff profile on this account.")
    return current_user.staff_profile_uuid


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


@router.get("", response_model=list[VehicleArrangementStaffRead])
async def list_vehicle_arrangements(
    status_filter: VehicleArrangementStatus | None = None,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> list[VehicleArrangementStaffRead]:
    return [
        _to_read(view)
        for view in await list_for_employee(db, _profile_id(current_user), status_filter)
    ]


@router.patch("/{arrangement_id}", response_model=VehicleArrangementStaffRead)
async def patch_vehicle_arrangement(
    arrangement_id: UUID,
    payload: VehicleArrangementEmployeeUpdate,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> VehicleArrangementStaffRead:
    try:
        return _to_read(
            await update_for_employee(
                db, arrangement_id, _profile_id(current_user), payload, current_user
            )
        )
    except ArrangementNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle arrangement not found.") from exc
    except ArrangementTerminal as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This arrangement is already closed."
        ) from exc
    except (
        InvalidArrangementTransition,
        ArrangementDetailsRequired,
        InvalidArrangementEmployee,
    ) as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "This status change is not allowed.") from exc
