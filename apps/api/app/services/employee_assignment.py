"""Durable round-robin assignment for field tasks and ready vehicle pickups."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.models.profile import ProfileStatus, StaffProfile, StaffRole
from app.models.task import EmployeeAssignmentCursor, Task, TaskStatus
from app.models.vehicle_arrangement import VehicleArrangement, VehicleArrangementStatus
from app.services.audit_log import record as record_audit
from app.services.notifications import emit_notification

_VALID_LINES = frozenset({"loans", "real_estate"})


@dataclass(frozen=True)
class EmployeeAssignmentNotice:
    user_uuid: UUID
    work_kind: str
    business_line: str


async def _lock_line(db: AsyncSession, business_line: str) -> None:
    await db.scalar(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(f"employee-assignment:{business_line}", 0)
            )
        )
    )


async def lock_assignment_lines(db: AsyncSession, business_lines: set[str]) -> None:
    for business_line in sorted(business_lines & _VALID_LINES):
        await _lock_line(db, business_line)


async def _select_employee(db: AsyncSession, business_line: str) -> StaffProfile | None:
    employees = list(
        (
            await db.scalars(
                select(StaffProfile)
                .where(
                    StaffProfile.role == StaffRole.EMPLOYEE,
                    StaffProfile.status == ProfileStatus.ACTIVE,
                    StaffProfile.business_line.in_((business_line, "both")),
                )
                .order_by(StaffProfile.created_at, StaffProfile.id)
                .with_for_update()
            )
        ).all()
    )
    if not employees:
        return None

    cursor = await db.scalar(
        select(EmployeeAssignmentCursor)
        .where(EmployeeAssignmentCursor.business_line == business_line)
        .with_for_update()
    )
    if cursor is None:
        cursor = EmployeeAssignmentCursor(business_line=business_line)
        db.add(cursor)

    selected = employees[0]
    if cursor.last_employee_profile_uuid is not None:
        previous = await db.get(StaffProfile, cursor.last_employee_profile_uuid)
        if previous is not None:
            previous_key = (previous.created_at, previous.id)
            selected = next(
                (
                    employee
                    for employee in employees
                    if (employee.created_at, employee.id) > previous_key
                ),
                employees[0],
            )

    cursor.last_employee_profile_uuid = selected.id
    cursor.updated_at = datetime.now(UTC)
    return selected


async def auto_assign_locked_task(db: AsyncSession, task: Task) -> EmployeeAssignmentNotice | None:
    if (
        task.business_line not in _VALID_LINES
        or task.assigned_employee_profile_uuid is not None
        or task.status != TaskStatus.UNASSIGNED
    ):
        return None
    await _lock_line(db, task.business_line)
    employee = await _select_employee(db, task.business_line)
    if employee is None:
        return None
    task.assigned_employee_profile_uuid = employee.id
    task.status = TaskStatus.ASSIGNED
    task.updated_at = datetime.now(UTC)
    await record_audit(
        db,
        action=AuditAction.EMPLOYEE_WORK_ASSIGNED,
        entity_type="task",
        entity_uuid=task.id,
        actor_uuid=None,
        actor_role=None,
        business_line=task.business_line,
        detail={"mode": "automatic", "employee_staff_profile_uuid": str(employee.id)},
    )
    await db.flush()
    return EmployeeAssignmentNotice(employee.auth_user_uuid, "field task", task.business_line)


async def auto_assign_locked_vehicle(
    db: AsyncSession, arrangement: VehicleArrangement
) -> EmployeeAssignmentNotice | None:
    if (
        arrangement.business_line not in _VALID_LINES
        or arrangement.assigned_employee_profile_uuid is not None
        or arrangement.status != VehicleArrangementStatus.ARRANGED
    ):
        return None
    await _lock_line(db, arrangement.business_line)
    employee = await _select_employee(db, arrangement.business_line)
    if employee is None:
        return None
    arrangement.assigned_employee_profile_uuid = employee.id
    arrangement.status = VehicleArrangementStatus.ASSIGNED
    arrangement.updated_at = datetime.now(UTC)
    await record_audit(
        db,
        action=AuditAction.EMPLOYEE_WORK_ASSIGNED,
        entity_type="vehicle_arrangement",
        entity_uuid=arrangement.id,
        actor_uuid=None,
        actor_role=None,
        business_line=arrangement.business_line,
        detail={"mode": "automatic", "employee_staff_profile_uuid": str(employee.id)},
    )
    await db.flush()
    return EmployeeAssignmentNotice(
        employee.auth_user_uuid, "vehicle pickup", business_line="real_estate"
    )


async def notify_employee_assignments(notices: list[EmployeeAssignmentNotice]) -> None:
    for notice in notices:
        is_vehicle_pickup = notice.work_kind == "vehicle pickup"
        await emit_notification(
            user_uuid=notice.user_uuid,
            notification_type=(
                NotificationType.VEHICLE_ARRANGEMENT_UPDATED
                if is_vehicle_pickup
                else NotificationType.TASK_ASSIGNED
            ),
            title=f"New {notice.work_kind} assigned",
            body=f"A {notice.business_line} {notice.work_kind} has been assigned to you.",
            href=("/dashboard/vehicle-arrangements" if is_vehicle_pickup else "/dashboard/tasks"),
        )


async def assign_task_if_possible(task_id: UUID) -> bool:
    notice: EmployeeAssignmentNotice | None = None
    async with db_session.AsyncSessionLocal() as session:
        business_line = await session.scalar(select(Task.business_line).where(Task.id == task_id))
        if business_line not in _VALID_LINES:
            return False
        await _lock_line(session, business_line)
        task = await session.scalar(select(Task).where(Task.id == task_id).with_for_update())
        if task is not None:
            notice = await auto_assign_locked_task(session, task)
        await session.commit()
    if notice is not None:
        await notify_employee_assignments([notice])
    return notice is not None


async def assign_vehicle_if_possible(arrangement_id: UUID) -> bool:
    notice: EmployeeAssignmentNotice | None = None
    async with db_session.AsyncSessionLocal() as session:
        business_line = await session.scalar(
            select(VehicleArrangement.business_line).where(VehicleArrangement.id == arrangement_id)
        )
        if business_line not in _VALID_LINES:
            return False
        await _lock_line(session, business_line)
        arrangement = await session.scalar(
            select(VehicleArrangement)
            .where(VehicleArrangement.id == arrangement_id)
            .with_for_update()
        )
        if arrangement is not None:
            notice = await auto_assign_locked_vehicle(session, arrangement)
        await session.commit()
    if notice is not None:
        await notify_employee_assignments([notice])
    return notice is not None


async def assign_employee_work_batch(
    session: AsyncSession, *, limit: int = 200
) -> tuple[int, list[EmployeeAssignmentNotice]]:
    await lock_assignment_lines(session, set(_VALID_LINES))
    stale_tasks = list(
        (
            await session.scalars(
                select(Task)
                .outerjoin(
                    StaffProfile,
                    StaffProfile.id == Task.assigned_employee_profile_uuid,
                )
                .where(
                    Task.status.in_(
                        (TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED)
                    ),
                    or_(
                        StaffProfile.id.is_(None),
                        StaffProfile.status != ProfileStatus.ACTIVE,
                        StaffProfile.role != StaffRole.EMPLOYEE,
                        and_(
                            StaffProfile.business_line != "both",
                            StaffProfile.business_line != Task.business_line,
                        ),
                    ),
                )
                .limit(limit)
                .with_for_update(of=Task, skip_locked=True)
            )
        ).all()
    )
    for task in stale_tasks:
        task.assigned_employee_profile_uuid = None
        task.status = TaskStatus.UNASSIGNED

    stale_arrangements = list(
        (
            await session.scalars(
                select(VehicleArrangement)
                .outerjoin(
                    StaffProfile,
                    StaffProfile.id == VehicleArrangement.assigned_employee_profile_uuid,
                )
                .where(
                    VehicleArrangement.status == VehicleArrangementStatus.ASSIGNED,
                    or_(
                        StaffProfile.id.is_(None),
                        StaffProfile.status != ProfileStatus.ACTIVE,
                        StaffProfile.role != StaffRole.EMPLOYEE,
                        and_(
                            StaffProfile.business_line != "both",
                            StaffProfile.business_line != VehicleArrangement.business_line,
                        ),
                    ),
                )
                .limit(limit)
                .with_for_update(of=VehicleArrangement, skip_locked=True)
            )
        ).all()
    )
    for arrangement in stale_arrangements:
        arrangement.assigned_employee_profile_uuid = None
        arrangement.status = VehicleArrangementStatus.ARRANGED
    if stale_tasks or stale_arrangements:
        await session.flush()

    tasks = list(
        (
            await session.scalars(
                select(Task)
                .where(
                    Task.business_line.in_(tuple(_VALID_LINES)),
                    Task.assigned_employee_profile_uuid.is_(None),
                    Task.status == TaskStatus.UNASSIGNED,
                )
                .order_by(Task.created_at, Task.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).all()
    )
    arrangements = list(
        (
            await session.scalars(
                select(VehicleArrangement)
                .where(
                    VehicleArrangement.assigned_employee_profile_uuid.is_(None),
                    VehicleArrangement.status == VehicleArrangementStatus.ARRANGED,
                )
                .order_by(VehicleArrangement.created_at, VehicleArrangement.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).all()
    )
    work = sorted(
        [*(("task", item) for item in tasks), *(("vehicle", item) for item in arrangements)],
        key=lambda pair: (pair[1].created_at, pair[1].id),
    )[:limit]
    notices: list[EmployeeAssignmentNotice] = []
    for kind, item in work:
        notice = (
            await auto_assign_locked_task(session, item)
            if kind == "task"
            else await auto_assign_locked_vehicle(session, item)
        )
        if notice is not None:
            notices.append(notice)
    await session.commit()
    return len(work), notices
