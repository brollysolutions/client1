"""Employee field-task surface — list/detail own assigned tasks, transition
status, record a background_check outcome, home summary.

Every function here runs on the request-scoped `db` session (Depends(get_db)):
tasks_rls already narrows an employee's queries to tasks assigned to them
(own-line + assigned_employee_profile_uuid = self). The explicit
`assigned_employee_profile_uuid` filters below are defense-in-depth, not the
only wall — same posture as services/telecaller.py.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead
from app.models.task import BgCheckOutcome, Task, TaskStatus, TaskType
from app.schemas.employee import EmployeeTaskUpdate

_TERMINAL = {TaskStatus.COMPLETED, TaskStatus.CANCELLED}

# assigned -> blocked is allowed directly (a task can be blocked before work
# starts, e.g. the employee can't reach the address yet). 'unassigned' is
# excluded: tasks_rls never surfaces an unassigned task to an employee.
_ALLOWED_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.ASSIGNED: {TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED},
    TaskStatus.IN_PROGRESS: {TaskStatus.COMPLETED, TaskStatus.BLOCKED, TaskStatus.CANCELLED},
    TaskStatus.BLOCKED: {TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED},
}


class TaskAlreadyTerminal(Exception):
    """Raised when any field change is attempted on a completed/cancelled task."""


class IllegalTransition(Exception):
    """Raised when the requested status isn't reachable from the task's current status."""


class OutcomeNotApplicable(Exception):
    """Raised when outcome is set on a non-background_check task, or the
    resulting status isn't 'completed'."""


class OutcomeRequired(Exception):
    """Raised when completing a background_check task with no outcome
    (existing or provided in this update)."""


def _base_stmt():
    return select(Task, Lead.name, Lead.mobile).join(Lead, Lead.id == Task.lead_uuid)


async def list_tasks_for_employee(
    db: AsyncSession,
    staff_profile_uuid: UUID,
    status_filter: str | None = None,
    task_type_filter: str | None = None,
) -> list[tuple[Task, str | None, str]]:
    stmt = _base_stmt().where(Task.assigned_employee_profile_uuid == staff_profile_uuid)
    if status_filter is not None:
        stmt = stmt.where(Task.status == TaskStatus(status_filter))
    if task_type_filter is not None:
        stmt = stmt.where(Task.task_type == TaskType(task_type_filter))
    stmt = stmt.order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc())
    rows = (await db.execute(stmt)).all()
    return [(row[0], row[1], row[2]) for row in rows]


async def get_task_for_employee(
    db: AsyncSession, task_id: UUID, staff_profile_uuid: UUID
) -> tuple[Task, str | None, str] | None:
    stmt = _base_stmt().where(
        Task.id == task_id, Task.assigned_employee_profile_uuid == staff_profile_uuid
    )
    row = (await db.execute(stmt)).first()
    return (row[0], row[1], row[2]) if row is not None else None


async def get_task_for_update(
    db: AsyncSession, task_id: UUID, staff_profile_uuid: UUID
) -> Task | None:
    """Row-locked fetch for the PATCH path — mirrors services/tasks.py's
    with_for_update on assign_task_to_employee. Prevents two concurrent PATCHes
    (double-tap, multi-tab) from both reading the same pre-update status and
    silently clobbering each other's state-machine/outcome writes."""
    stmt = (
        select(Task)
        .where(Task.id == task_id, Task.assigned_employee_profile_uuid == staff_profile_uuid)
        .with_for_update()
    )
    return await db.scalar(stmt)


async def update_task(db: AsyncSession, task: Task, payload: EmployeeTaskUpdate) -> Task:
    if task.status in _TERMINAL and (
        payload.status is not None or payload.notes is not None or payload.outcome is not None
    ):
        raise TaskAlreadyTerminal

    next_status = TaskStatus(payload.status) if payload.status is not None else task.status
    if (
        payload.status is not None
        and next_status != task.status
        and next_status not in _ALLOWED_TRANSITIONS.get(task.status, set())
    ):
        raise IllegalTransition

    if payload.outcome is not None and (
        task.task_type != TaskType.BACKGROUND_CHECK or next_status != TaskStatus.COMPLETED
    ):
        raise OutcomeNotApplicable

    if (
        task.task_type == TaskType.BACKGROUND_CHECK
        and next_status == TaskStatus.COMPLETED
        and task.outcome is None
        and payload.outcome is None
    ):
        raise OutcomeRequired

    if payload.status is not None:
        task.status = next_status
    if payload.notes is not None:
        task.notes = payload.notes
    if payload.outcome is not None:
        task.outcome = BgCheckOutcome(payload.outcome)

    await db.commit()
    await db.refresh(task)
    return task


async def get_home_summary(
    db: AsyncSession, staff_profile_uuid: UUID
) -> tuple[list[tuple[Task, str | None, str]], int, dict[str, int], dict[str, int]]:
    """Returns (tasks_today, overdue_count, counts_by_type, counts_by_status),
    computed in Python over the employee's full task list — same posture as
    telecaller's get_home_summary (small per-employee scale, no SQL
    aggregation needed)."""
    rows = await list_tasks_for_employee(db, staff_profile_uuid)
    now = datetime.now(UTC)
    today = now.date()
    counts_by_type: dict[str, int] = {}
    counts_by_status: dict[str, int] = {}
    tasks_today: list[tuple[Task, str | None, str]] = []
    overdue_count = 0
    for task, name, mobile in rows:
        counts_by_type[task.task_type.value] = counts_by_type.get(task.task_type.value, 0) + 1
        counts_by_status[task.status.value] = counts_by_status.get(task.status.value, 0) + 1
        if task.status in _TERMINAL or task.due_at is None:
            continue
        due = task.due_at if task.due_at.tzinfo else task.due_at.replace(tzinfo=UTC)
        if due < now:
            overdue_count += 1
        if due.date() == today:
            tasks_today.append((task, name, mobile))
    tasks_today.sort(key=lambda row: row[0].due_at)
    return tasks_today, overdue_count, counts_by_type, counts_by_status
