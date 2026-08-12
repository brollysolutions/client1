"""Vehicle-arrangement state machine, assignment, audit, and notifications."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.deps import CurrentUser
from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.models.profile import ProfileStatus, StaffProfile, StaffRole
from app.models.site_visit import SiteVisit
from app.models.user import User
from app.models.vehicle_arrangement import VehicleArrangement, VehicleArrangementStatus
from app.schemas.vehicle_arrangements import (
    VehicleArrangementAdminUpdate,
    VehicleArrangementEmployeeUpdate,
)
from app.services.audit_log import record
from app.services.employee_assignment import assign_vehicle_if_possible
from app.services.notifications import emit_notification

logger = logging.getLogger(__name__)


class ArrangementNotFound(Exception):
    pass


class ArrangementTerminal(Exception):
    pass


class InvalidArrangementTransition(Exception):
    pass


class ArrangementDetailsRequired(Exception):
    pass


class InvalidArrangementEmployee(Exception):
    pass


@dataclass(frozen=True)
class VehicleArrangementView:
    arrangement: VehicleArrangement
    visit: SiteVisit
    employee_name: str | None


_ALLOWED_TRANSITIONS = {
    VehicleArrangementStatus.REQUESTED: {
        VehicleArrangementStatus.ARRANGED,
        VehicleArrangementStatus.CANCELLED,
    },
    VehicleArrangementStatus.ARRANGED: {
        VehicleArrangementStatus.ASSIGNED,
        VehicleArrangementStatus.CANCELLED,
    },
    VehicleArrangementStatus.ASSIGNED: {
        VehicleArrangementStatus.COMPLETED,
        VehicleArrangementStatus.CANCELLED,
    },
}
_TERMINAL = {VehicleArrangementStatus.COMPLETED, VehicleArrangementStatus.CANCELLED}


def _view_stmt():
    employee_user = aliased(User)
    return (
        select(VehicleArrangement, SiteVisit, employee_user.first_name, employee_user.last_name)
        .join(SiteVisit, SiteVisit.id == VehicleArrangement.site_visit_uuid)
        .outerjoin(
            StaffProfile,
            StaffProfile.id == VehicleArrangement.assigned_employee_profile_uuid,
        )
        .outerjoin(employee_user, employee_user.id == StaffProfile.auth_user_uuid)
    )


def _to_view(row) -> VehicleArrangementView:  # noqa: ANN001
    first, last = row[2], row[3]
    name = f"{first or ''} {last or ''}".strip() or None
    return VehicleArrangementView(arrangement=row[0], visit=row[1], employee_name=name)


async def list_for_admin(
    db: AsyncSession, status_filter: VehicleArrangementStatus | None = None
) -> list[VehicleArrangementView]:
    stmt = _view_stmt()
    if status_filter is not None:
        stmt = stmt.where(VehicleArrangement.status == status_filter)
    rows = (await db.execute(stmt.order_by(VehicleArrangement.created_at.desc()))).all()
    return [_to_view(row) for row in rows]


async def list_for_employee(
    db: AsyncSession,
    employee_profile_uuid: UUID,
    status_filter: VehicleArrangementStatus | None = None,
) -> list[VehicleArrangementView]:
    stmt = _view_stmt().where(
        VehicleArrangement.assigned_employee_profile_uuid == employee_profile_uuid
    )
    if status_filter is not None:
        stmt = stmt.where(VehicleArrangement.status == status_filter)
    rows = (await db.execute(stmt.order_by(VehicleArrangement.pickup_at.asc()))).all()
    return [_to_view(row) for row in rows]


async def _active_real_estate_employee(
    db: AsyncSession, employee_profile_uuid: UUID
) -> StaffProfile:
    employee = await db.get(StaffProfile, employee_profile_uuid)
    if (
        employee is None
        or employee.role != StaffRole.EMPLOYEE
        or employee.status != ProfileStatus.ACTIVE
        or employee.business_line not in ("real_estate", "both")
    ):
        raise InvalidArrangementEmployee
    return employee


def _has_transport_details(arrangement: VehicleArrangement) -> bool:
    return all(
        (
            arrangement.vehicle_make_model,
            arrangement.vehicle_registration,
            arrangement.driver_name,
            arrangement.driver_mobile,
        )
    )


def _validate_status_invariants(
    arrangement: VehicleArrangement,
    status: VehicleArrangementStatus | None = None,
) -> None:
    effective_status = status or arrangement.status
    if effective_status in {
        VehicleArrangementStatus.ARRANGED,
        VehicleArrangementStatus.ASSIGNED,
        VehicleArrangementStatus.COMPLETED,
    } and not _has_transport_details(arrangement):
        raise ArrangementDetailsRequired
    if (
        effective_status
        in {
            VehicleArrangementStatus.ASSIGNED,
            VehicleArrangementStatus.COMPLETED,
        }
        and arrangement.assigned_employee_profile_uuid is None
    ):
        raise InvalidArrangementEmployee


def _apply_transition(
    arrangement: VehicleArrangement, next_status: VehicleArrangementStatus
) -> None:
    if arrangement.status in _TERMINAL:
        raise ArrangementTerminal
    if next_status != arrangement.status and next_status not in _ALLOWED_TRANSITIONS.get(
        arrangement.status, set()
    ):
        raise InvalidArrangementTransition
    _validate_status_invariants(arrangement, next_status)
    now = datetime.now(UTC)
    arrangement.status = next_status
    if next_status == VehicleArrangementStatus.COMPLETED:
        arrangement.completed_at = now
    if next_status == VehicleArrangementStatus.CANCELLED:
        arrangement.cancelled_at = now


async def _notify_client(
    arrangement: VehicleArrangement, visit: SiteVisit, old_status: VehicleArrangementStatus
) -> None:
    if arrangement.status == old_status:
        return
    labels = {
        VehicleArrangementStatus.ARRANGED: "arranged",
        VehicleArrangementStatus.ASSIGNED: "assigned",
        VehicleArrangementStatus.COMPLETED: "completed",
        VehicleArrangementStatus.CANCELLED: "cancelled",
    }
    label = labels.get(arrangement.status)
    if label is None:
        return
    await emit_notification(
        user_uuid=visit.user_uuid,
        notification_type=NotificationType.VEHICLE_ARRANGEMENT_UPDATED,
        title="Vehicle arrangement updated",
        body=f"Your site-visit pickup is now {label}.",
        href="/dashboard/site-visits",
    )


async def update_for_admin(
    db: AsyncSession,
    arrangement_id: UUID,
    payload: VehicleArrangementAdminUpdate,
    current_user: CurrentUser,
) -> VehicleArrangementView:
    arrangement = await db.scalar(
        select(VehicleArrangement).where(VehicleArrangement.id == arrangement_id).with_for_update()
    )
    if arrangement is None:
        raise ArrangementNotFound
    if arrangement.status in _TERMINAL:
        raise ArrangementTerminal

    old_status = arrangement.status
    if (
        "cancellation_reason" in payload.model_fields_set
        and payload.status != VehicleArrangementStatus.CANCELLED
    ):
        raise InvalidArrangementTransition
    for field_name in (
        "vehicle_make_model",
        "vehicle_registration",
        "driver_name",
        "driver_mobile",
        "cancellation_reason",
    ):
        if field_name in payload.model_fields_set:
            setattr(arrangement, field_name, getattr(payload, field_name))

    if payload.status is not None:
        _apply_transition(arrangement, payload.status)
    else:
        _validate_status_invariants(arrangement)
    if arrangement.arranged_by_staff_profile_uuid is None:
        arrangement.arranged_by_staff_profile_uuid = current_user.staff_profile_uuid

    await record(
        db,
        action=AuditAction.VEHICLE_ARRANGEMENT_UPDATED,
        entity_type="vehicle_arrangement",
        entity_uuid=arrangement.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line="real_estate",
        detail={
            "from_status": old_status.value,
            "to_status": arrangement.status.value,
            "assigned_employee_profile_uuid": (
                str(arrangement.assigned_employee_profile_uuid)
                if arrangement.assigned_employee_profile_uuid
                else None
            ),
        },
    )
    visit = await db.get(SiteVisit, arrangement.site_visit_uuid)
    await db.commit()
    await db.refresh(arrangement)
    if arrangement.status == VehicleArrangementStatus.ARRANGED:
        try:
            await assign_vehicle_if_possible(arrangement.id)
            await db.refresh(arrangement)
        except Exception:
            # The arranged row remains in the durable scheduler retry pool.
            logger.warning(
                "vehicle_arrangement.immediate_assignment_failed arrangement_id=%s",
                arrangement.id,
                exc_info=True,
            )
    await _notify_client(arrangement, visit, old_status)
    rows = (await db.execute(_view_stmt().where(VehicleArrangement.id == arrangement.id))).first()
    return _to_view(rows)


async def update_for_employee(
    db: AsyncSession,
    arrangement_id: UUID,
    employee_profile_uuid: UUID,
    payload: VehicleArrangementEmployeeUpdate,
    current_user: CurrentUser,
) -> VehicleArrangementView:
    arrangement = await db.scalar(
        select(VehicleArrangement)
        .where(
            VehicleArrangement.id == arrangement_id,
            VehicleArrangement.assigned_employee_profile_uuid == employee_profile_uuid,
        )
        .with_for_update()
    )
    if arrangement is None:
        raise ArrangementNotFound
    old_status = arrangement.status
    if payload.cancellation_reason is not None:
        arrangement.cancellation_reason = payload.cancellation_reason
    _apply_transition(arrangement, VehicleArrangementStatus(payload.status))
    await record(
        db,
        action=AuditAction.VEHICLE_ARRANGEMENT_UPDATED,
        entity_type="vehicle_arrangement",
        entity_uuid=arrangement.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line="real_estate",
        detail={"from_status": old_status.value, "to_status": arrangement.status.value},
    )
    visit = await db.get(SiteVisit, arrangement.site_visit_uuid)
    await db.commit()
    await db.refresh(arrangement)
    await _notify_client(arrangement, visit, old_status)
    rows = (await db.execute(_view_stmt().where(VehicleArrangement.id == arrangement.id))).first()
    return _to_view(rows)
