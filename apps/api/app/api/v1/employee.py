"""Employee router — assigned-task list/detail, status/outcome update, home.

Every route depends on require_employee (app-layer gate) on top of the
tasks_rls own-assignment RLS predicate (defense in depth, same posture as
every other role-gated router in this codebase).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_employee
from app.db.session import get_db
from app.models.lead import Lead
from app.models.task import Task
from app.schemas.employee import (
    EmployeeHomeResponse,
    EmployeeTaskRead,
    EmployeeTaskUpdate,
    TaskStatusLiteral,
    TaskTypeLiteral,
)
from app.services.employee import (
    IllegalTransition,
    OutcomeNotApplicable,
    OutcomeRequired,
    TaskAlreadyTerminal,
    get_home_summary,
    get_task_for_employee,
    get_task_for_update,
    list_tasks_for_employee,
    update_task,
)

router = APIRouter()


def _staff_profile_uuid(current_user: CurrentUser) -> UUID:
    if current_user.staff_profile_uuid is None:
        # pragma: no cover — every employee JWT carries one
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No staff profile on this account.")
    return current_user.staff_profile_uuid


def _to_read(task: Task, lead_name: str | None, lead_mobile: str) -> EmployeeTaskRead:
    return EmployeeTaskRead(
        id=task.id,
        lead_uuid=task.lead_uuid,
        lead_name=lead_name,
        lead_mobile=lead_mobile,
        business_line=task.business_line,
        task_type=task.task_type,
        status=task.status,
        outcome=task.outcome,
        notes=task.notes,
        due_at=task.due_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("/tasks", response_model=list[EmployeeTaskRead])
async def list_tasks(
    status_filter: TaskStatusLiteral | None = None,
    task_type_filter: TaskTypeLiteral | None = None,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> list[EmployeeTaskRead]:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    rows = await list_tasks_for_employee(db, staff_profile_uuid, status_filter, task_type_filter)
    return [_to_read(task, name, mobile) for task, name, mobile in rows]


@router.get("/tasks/{task_id}", response_model=EmployeeTaskRead)
async def get_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> EmployeeTaskRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    row = await get_task_for_employee(db, task_id, staff_profile_uuid)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return _to_read(*row)


@router.patch("/tasks/{task_id}", response_model=EmployeeTaskRead)
async def patch_task(
    task_id: UUID,
    payload: EmployeeTaskUpdate,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> EmployeeTaskRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    task = await get_task_for_update(db, task_id, staff_profile_uuid)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    try:
        task = await update_task(db, task, payload)
    except IllegalTransition as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This status change isn't allowed from the task's current state.",
        ) from exc
    except OutcomeNotApplicable as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Outcome can only be set for a background_check task being marked completed.",
        ) from exc
    except OutcomeRequired as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An outcome is required to mark this background check completed.",
        ) from exc
    except TaskAlreadyTerminal as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This task is already closed; no further changes are allowed.",
        ) from exc
    lead = await db.get(Lead, task.lead_uuid)
    return _to_read(task, lead.name if lead else None, lead.mobile if lead else "")


@router.get("/home", response_model=EmployeeHomeResponse)
async def home(
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> EmployeeHomeResponse:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    tasks_today, overdue_count, counts_by_type, counts_by_status = await get_home_summary(
        db, staff_profile_uuid
    )
    return EmployeeHomeResponse(
        tasks_today=[_to_read(task, name, mobile) for task, name, mobile in tasks_today],
        overdue_count=overdue_count,
        counts_by_type=counts_by_type,
        counts_by_status=counts_by_status,
    )
