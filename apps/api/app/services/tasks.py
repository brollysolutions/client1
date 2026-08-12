"""Read-only Admin projections for automatic Employee field assignment."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.lead import Lead
from app.models.profile import ProfileStatus, StaffProfile, StaffRole
from app.models.task import Task, TaskStatus, TaskType
from app.models.user import User


@dataclass(frozen=True)
class AdminTaskView:
    task: Task
    lead_name: str | None
    lead_mobile: str
    raised_by_telecaller_name: str | None
    assigned_employee_name: str | None


def _display_name(first_name: str | None, last_name: str | None) -> str | None:
    return f"{first_name or ''} {last_name or ''}".strip() or None


async def list_tasks_for_admin(
    db: AsyncSession,
    status_filter: TaskStatus | None = None,
    task_type_filter: TaskType | None = None,
    *,
    limit: int = 200,
) -> list[AdminTaskView]:
    raiser = aliased(StaffProfile)
    raiser_user = aliased(User)
    employee = aliased(StaffProfile)
    employee_user = aliased(User)
    stmt = (
        select(
            Task,
            Lead.name,
            Lead.mobile,
            raiser_user.first_name,
            raiser_user.last_name,
            employee_user.first_name,
            employee_user.last_name,
        )
        .join(Lead, Lead.id == Task.lead_uuid)
        .join(raiser, raiser.id == Task.raised_by_staff_profile_uuid)
        .join(raiser_user, raiser_user.id == raiser.auth_user_uuid)
        .outerjoin(employee, employee.id == Task.assigned_employee_profile_uuid)
        .outerjoin(employee_user, employee_user.id == employee.auth_user_uuid)
    )
    if status_filter is not None:
        stmt = stmt.where(Task.status == status_filter)
    if task_type_filter is not None:
        stmt = stmt.where(Task.task_type == task_type_filter)
    rows = (await db.execute(stmt.order_by(Task.created_at.desc()).limit(limit))).all()
    return [
        AdminTaskView(
            task=row[0],
            lead_name=row[1],
            lead_mobile=row[2],
            raised_by_telecaller_name=_display_name(row[3], row[4]),
            assigned_employee_name=_display_name(row[5], row[6]),
        )
        for row in rows
    ]


async def list_active_employees(
    db: AsyncSession,
    business_line: str | None = None,
    role: StaffRole = StaffRole.EMPLOYEE,
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
        stmt = stmt.where(StaffProfile.business_line.in_((business_line, "both")))
    stmt = stmt.order_by(User.first_name, User.last_name)
    return [(profile, user) for profile, user in (await db.execute(stmt)).all()]
