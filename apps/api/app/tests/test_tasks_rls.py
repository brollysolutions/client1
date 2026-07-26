"""tasks RLS — raised-by-self OR assigned-employee-self, line-scoped, platform bypass.

Verifies migration b2c3d4e5f6a7's policy: the telecaller who raised a task sees
it, an employee it's later assigned to sees it, an unrelated same-line staff
member sees nothing, a cross-line staff member sees nothing, and platform Admin
sees everything. Also documents the UPDATE grant surface: the raiser can UPDATE
their own raised row (own-rows RLS still applies), but not another row.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import unique_mobile


async def _seed_staff_profile(role: str, business_line: str = "loans") -> tuple[str, str]:
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Staff",
            mobile=unique_mobile(),
            email=f"st_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole(role),
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"ST-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _seed_task(
    business_line: str,
    raised_by_staff_uuid: str,
    assigned_employee_staff_uuid: str | None = None,
    status: str = "unassigned",
) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.task import Task, TaskStatus, TaskType

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(raised_by_staff_uuid),
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=uuid.UUID(raised_by_staff_uuid),
            assigned_employee_profile_uuid=(
                uuid.UUID(assigned_employee_staff_uuid) if assigned_employee_staff_uuid else None
            ),
            business_line=business_line,
            task_type=TaskType.DOCUMENT_COLLECTION,
            lead_uuid=lead.id,
            status=TaskStatus(status),
        )
        db.add(task)
        await db.commit()
        return str(task.id)


async def _select_as(
    *,
    role: str,
    staff_profile_uuid: str = "",
    platform_scope: str = "false",
    business_line: str = "loans",
) -> list[dict]:
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    engine = create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT "
                    "set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', :role, true),"
                    "set_config('app.business_line', :bl, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', :spu, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "spu": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM tasks"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


async def _update_notes_as(
    *, task_id: str, new_notes: str, staff_profile_uuid: str, business_line: str = "loans"
) -> None:
    """UPDATE under the given RLS context. A row outside the caller's own-rows
    predicate is simply not matched (0 rows affected, no exception) — Postgres
    RLS UPDATE semantics, not a raised error."""
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    engine = create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT "
                    "set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', 'telecaller', true),"
                    "set_config('app.business_line', :bl, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', :spu, true),"
                    "set_config('app.platform_scope', 'false', true)"
                ),
                {"uuid": str(uuid.uuid4()), "bl": business_line, "spu": staff_profile_uuid},
            )
            await conn.execute(
                text("UPDATE tasks SET notes = :notes WHERE id = :id"),
                {"notes": new_notes, "id": task_id},
            )
    finally:
        await engine.dispose()


async def _fetch_notes(task_id: str) -> str | None:
    import app.db.session as _session_mod
    from app.models.task import Task

    async with _session_mod.AsyncSessionLocal() as db:
        task = await db.get(Task, uuid.UUID(task_id))
        assert task is not None
        return task.notes


@pytest.mark.asyncio
async def test_raiser_sees_own_task(client: AsyncClient) -> None:
    _, raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)

    rows = await _select_as(role="telecaller", staff_profile_uuid=raiser_uuid)
    assert task_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_assigned_employee_sees_task_post_assign(client: AsyncClient) -> None:
    _, raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    _, employee_uuid = await _seed_staff_profile("employee", "loans")
    task_id = await _seed_task(
        "loans", raiser_uuid, assigned_employee_staff_uuid=employee_uuid, status="assigned"
    )

    rows = await _select_as(role="employee", staff_profile_uuid=employee_uuid)
    assert task_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_unrelated_same_line_staff_sees_nothing(client: AsyncClient) -> None:
    _, raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    _, other_uuid = await _seed_staff_profile("employee", "loans")
    await _seed_task("loans", raiser_uuid)

    rows = await _select_as(role="employee", staff_profile_uuid=other_uuid)
    assert rows == []


@pytest.mark.asyncio
async def test_cross_line_staff_sees_nothing(client: AsyncClient) -> None:
    _, raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    _, re_employee_uuid = await _seed_staff_profile("employee", "real_estate")
    await _seed_task("loans", raiser_uuid)

    rows = await _select_as(
        role="employee", staff_profile_uuid=re_employee_uuid, business_line="real_estate"
    )
    assert rows == []


@pytest.mark.asyncio
async def test_platform_scope_sees_all(client: AsyncClient) -> None:
    _, raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert task_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_sub_admin_platform_scope_cannot_see_it(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: the platform_scope bypass is admin-only now."""
    _, raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)

    rows = await _select_as(role="sub_admin", platform_scope="true")
    assert task_id not in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_raiser_can_update_own_raised_task(client: AsyncClient) -> None:
    """Documents the grant surface: UPDATE is broader than this slice's
    endpoints use, but still constrained by own-rows RLS."""
    _, raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", raiser_uuid)

    await _update_notes_as(
        task_id=task_id, new_notes="edited by owner", staff_profile_uuid=raiser_uuid
    )

    assert await _fetch_notes(task_id) == "edited by owner"


@pytest.mark.asyncio
async def test_cross_row_update_invisible(client: AsyncClient) -> None:
    _, owner_uuid = await _seed_staff_profile("telecaller", "loans")
    _, other_uuid = await _seed_staff_profile("telecaller", "loans")
    task_id = await _seed_task("loans", owner_uuid)

    await _update_notes_as(
        task_id=task_id, new_notes="should not apply", staff_profile_uuid=other_uuid
    )

    assert await _fetch_notes(task_id) is None
