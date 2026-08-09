"""Admin task queue — list the unassigned pool, hand a task to an employee.

Mirrors services/leads.py::assign_lead_to_telecaller: runs on the admin's own
request session (their JWT's platform_scope="true" satisfies tasks_rls's
platform bypass branch, so no bypass superuser session is needed). Sends a
best-effort notification to the employee (emit_notification swallows its own
errors, so a failed notification never blocks the assignment). Deliberately
does NOT import AsyncSessionLocal — no conftest _patch_db_null_pool entry
needed for this module.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationType
from app.models.profile import ProfileStatus, StaffProfile, StaffRole
from app.models.task import Task, TaskStatus, TaskType
from app.models.user import User
from app.services.notifications import emit_notification


class TaskNotFound(Exception):
    """Raised when the target task id doesn't exist."""


class TaskNotAssignable(Exception):
    """Raised when the task isn't in the 'unassigned' state (prevents stealing
    an in-progress/completed task via re-assign)."""


class InvalidEmployee(Exception):
    """Raised when the target staff profile isn't an active employee on the
    task's business line."""


async def list_unassigned_tasks(
    db: AsyncSession,
    status_filter: TaskStatus | None = None,
    task_type_filter: TaskType | None = None,
    *,
    limit: int = 200,
) -> list[Task]:
    stmt = select(Task)
    if status_filter is not None:
        stmt = stmt.where(Task.status == status_filter)
    if task_type_filter is not None:
        stmt = stmt.where(Task.task_type == task_type_filter)
    stmt = stmt.order_by(Task.created_at.desc()).limit(limit)
    return list((await db.scalars(stmt)).all())


async def list_active_employees(
    db: AsyncSession, business_line: str | None = None, role: StaffRole = StaffRole.EMPLOYEE
) -> list[tuple[StaffProfile, User]]:
    stmt = (
        select(StaffProfile, User)
        .join(User, User.id == StaffProfile.auth_user_uuid)
        .where(
            StaffProfile.role == role,
            StaffProfile.status == ProfileStatus.ACTIVE,
        )
    )
    if business_line is not None:
        stmt = stmt.where(StaffProfile.business_line == business_line)
    stmt = stmt.order_by(User.first_name, User.last_name)
    return [(profile, user) for profile, user in (await db.execute(stmt)).all()]


async def assign_task_to_employee(
    db: AsyncSession, task_id: UUID, employee_profile_uuid: UUID
) -> Task:
    task = await db.get(Task, task_id, with_for_update=True)
    if task is None:
        raise TaskNotFound
    if task.status != TaskStatus.UNASSIGNED:
        raise TaskNotAssignable

    employee = await db.get(StaffProfile, employee_profile_uuid)
    if (
        employee is None
        or employee.role != StaffRole.EMPLOYEE
        or employee.status != ProfileStatus.ACTIVE
        or employee.business_line != task.business_line
    ):
        raise InvalidEmployee

    task.assigned_employee_profile_uuid = employee.id
    task.status = TaskStatus.ASSIGNED
    await db.commit()
    await db.refresh(task)

    await emit_notification(
        user_uuid=employee.auth_user_uuid,
        notification_type=NotificationType.TASK_ASSIGNED,
        title="New field task assigned",
        body=f"A new {task.task_type.value.replace('_', ' ')} task has been assigned to you.",
        href="/dashboard",
    )
    return task
