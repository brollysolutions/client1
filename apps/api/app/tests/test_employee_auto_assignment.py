"""Automatic per-line Employee assignment for field work."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError

import app.db.session as db_session
from app.models.audit_log import AuditAction, AuditLog
from app.models.lead import Lead, LeadStatus
from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
from app.models.task import EmployeeAssignmentCursor, Task, TaskStatus, TaskType
from app.models.user import User
from app.services.employee_assignment import assign_employee_work_batch, assign_task_if_possible
from conftest import unique_mobile


@pytest_asyncio.fixture(autouse=True)
async def _isolate_employees() -> AsyncIterator[None]:
    async with db_session.AsyncSessionLocal() as db:
        previously_active = set(
            (
                await db.scalars(
                    select(StaffProfile.id).where(
                        StaffProfile.role == StaffRole.EMPLOYEE,
                        StaffProfile.status == ProfileStatus.ACTIVE,
                    )
                )
            ).all()
        )
        await db.execute(
            update(StaffProfile)
            .where(StaffProfile.role == StaffRole.EMPLOYEE)
            .values(status=ProfileStatus.INACTIVE)
        )
        await db.execute(update(EmployeeAssignmentCursor).values(last_employee_profile_uuid=None))
        await db.commit()
    try:
        yield
    finally:
        async with db_session.AsyncSessionLocal() as db:
            await db.execute(
                update(StaffProfile)
                .where(StaffProfile.role == StaffRole.EMPLOYEE)
                .values(status=ProfileStatus.INACTIVE)
            )
            if previously_active:
                await db.execute(
                    update(StaffProfile)
                    .where(StaffProfile.id.in_(previously_active))
                    .values(status=ProfileStatus.ACTIVE)
                )
            await db.commit()


@pytest.fixture(autouse=True)
def _silence_notifications(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _noop(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr("app.services.employee_assignment.emit_notification", _noop)


async def _seed_staff(role: StaffRole, line: str, *, active: bool = True) -> StaffProfile:
    async with db_session.AsyncSessionLocal() as db:
        user = User(
            first_name="Automatic",
            last_name=role.value.title(),
            mobile=unique_mobile(),
            email=f"auto-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=role,
            scope=ProfileScope.LINE,
            business_line=line,
            staff_code=f"AUTO-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE if active else ProfileStatus.INACTIVE,
        )
        db.add(profile)
        await db.commit()
        return profile


async def _seed_task(line: str, raiser: StaffProfile) -> Task:
    async with db_session.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=line,
            status=LeadStatus.ASSIGNED,
            assigned_telecaller_profile_uuid=raiser.id,
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=raiser.id,
            business_line=line,
            task_type=TaskType.DOCUMENT_COLLECTION,
            lead_uuid=lead.id,
            status=TaskStatus.UNASSIGNED,
        )
        db.add(task)
        await db.commit()
        return task


@pytest.mark.asyncio
async def test_no_capacity_leaves_task_in_retryable_pool() -> None:
    raiser = await _seed_staff(StaffRole.TELECALLER, "loans")
    task = await _seed_task("loans", raiser)

    assert await assign_task_if_possible(task.id) is False
    async with db_session.AsyncSessionLocal() as db:
        stored = await db.get(Task, task.id)
        assert stored.status == TaskStatus.UNASSIGNED
        assert stored.assigned_employee_profile_uuid is None


@pytest.mark.asyncio
async def test_dual_line_employee_receives_each_line_and_assignments_are_audited() -> None:
    employee = await _seed_staff(StaffRole.EMPLOYEE, "both")
    tasks: list[Task] = []
    for line in ("loans", "real_estate"):
        raiser = await _seed_staff(StaffRole.TELECALLER, line)
        task = await _seed_task(line, raiser)
        assert await assign_task_if_possible(task.id) is True
        tasks.append(task)

    async with db_session.AsyncSessionLocal() as db:
        stored = [await db.get(Task, task.id) for task in tasks]
        assert all(task.assigned_employee_profile_uuid == employee.id for task in stored)
        audit_count = await db.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(
                AuditLog.entity_uuid.in_([task.id for task in tasks]),
                AuditLog.action == AuditAction.EMPLOYEE_WORK_ASSIGNED,
                AuditLog.actor_uuid.is_(None),
            )
        )
        assert audit_count == 2


@pytest.mark.asyncio
async def test_round_robin_cursor_rotates_in_stable_order() -> None:
    employees = [
        await _seed_staff(StaffRole.EMPLOYEE, "loans"),
        await _seed_staff(StaffRole.EMPLOYEE, "loans"),
    ]
    employees.sort(key=lambda employee: (employee.created_at, employee.id))
    raiser = await _seed_staff(StaffRole.TELECALLER, "loans")
    tasks = [await _seed_task("loans", raiser) for _ in range(4)]

    for task in tasks:
        assert await assign_task_if_possible(task.id) is True

    async with db_session.AsyncSessionLocal() as db:
        assigned = [(await db.get(Task, task.id)).assigned_employee_profile_uuid for task in tasks]
    assert assigned == [employees[0].id, employees[1].id, employees[0].id, employees[1].id]


@pytest.mark.asyncio
async def test_retry_reassigns_work_from_an_inactive_employee() -> None:
    first = await _seed_staff(StaffRole.EMPLOYEE, "loans")
    raiser = await _seed_staff(StaffRole.TELECALLER, "loans")
    task = await _seed_task("loans", raiser)
    assert await assign_task_if_possible(task.id) is True

    async with db_session.AsyncSessionLocal() as db:
        stored_first = await db.get(StaffProfile, first.id)
        stored_first.status = ProfileStatus.INACTIVE
        stored_task = await db.get(Task, task.id)
        stored_task.created_at = stored_task.created_at.replace(year=1999)
        await db.commit()
    replacement = await _seed_staff(StaffRole.EMPLOYEE, "loans")

    async with db_session.AsyncSessionLocal() as db:
        await assign_employee_work_batch(db)
    async with db_session.AsyncSessionLocal() as db:
        reassigned = await db.get(Task, task.id)
        assert reassigned.status == TaskStatus.ASSIGNED
        assert reassigned.assigned_employee_profile_uuid == replacement.id


@pytest.mark.asyncio
async def test_employee_cursor_is_unreachable_to_api_user() -> None:
    async with db_session.AsyncSessionLocal() as db:
        grants = list(
            (
                await db.scalars(
                    text(
                        "SELECT privilege_type FROM information_schema.role_table_grants "
                        "WHERE table_schema = 'public' "
                        "AND table_name = 'employee_assignment_cursors' "
                        "AND grantee = 'api_user'"
                    )
                )
            ).all()
        )
        rls = (
            await db.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity FROM pg_class "
                    "WHERE relname = 'employee_assignment_cursors'"
                )
            )
        ).one()
    assert grants == []
    assert rls == (True, True)

    async with db_session.AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL ROLE api_user"))
        with pytest.raises(DBAPIError):
            await db.execute(text("SELECT * FROM employee_assignment_cursors"))
        await db.rollback()


@pytest.mark.asyncio
async def test_database_rejects_cross_line_employee_cursor() -> None:
    real_estate_employee = await _seed_staff(StaffRole.EMPLOYEE, "real_estate")
    async with db_session.AsyncSessionLocal() as db:
        cursor = await db.get(EmployeeAssignmentCursor, "loans")
        cursor.last_employee_profile_uuid = real_estate_employee.id
        with pytest.raises(DBAPIError):
            await db.commit()
        await db.rollback()


@pytest.mark.asyncio
async def test_database_rejects_inactive_employee_cursor() -> None:
    inactive_employee = await _seed_staff(StaffRole.EMPLOYEE, "loans", active=False)
    async with db_session.AsyncSessionLocal() as db:
        cursor = await db.get(EmployeeAssignmentCursor, "loans")
        cursor.last_employee_profile_uuid = inactive_employee.id
        with pytest.raises(DBAPIError):
            await db.commit()
        await db.rollback()
