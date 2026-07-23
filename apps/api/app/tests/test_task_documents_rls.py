"""task_documents RLS — reachable only via the owning task's assigned
employee (not the raiser), line-scoped, platform bypass.

Verifies migration b3c4d5e6f7a8's policy: the employee a document_collection
task is assigned to sees its documents, an unrelated same-line employee sees
nothing, a cross-line employee sees nothing, the telecaller who *raised* the
task sees nothing either (document collection is the assigned employee's own
work — verification is a later Admin-side concern), and platform Admin sees
everything.
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


async def _seed_staff_profile(role: str, business_line: str = "loans") -> str:
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
        return str(profile.id)


async def _seed_task_with_document(
    business_line: str,
    raised_by_staff_uuid: str,
    assigned_employee_staff_uuid: str | None,
) -> str:
    """Returns the task_documents.id."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.task import Task, TaskDocument, TaskStatus, TaskType

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
            status=TaskStatus.ASSIGNED if assigned_employee_staff_uuid else TaskStatus.UNASSIGNED,
        )
        db.add(task)
        await db.flush()
        document = TaskDocument(task_uuid=task.id, doc_type="pan", object_key="tasks/x/y-pan")
        db.add(document)
        await db.commit()
        return str(document.id)


async def _select_documents_as(
    *,
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
                    "set_config('app.role', 'employee', true),"
                    "set_config('app.business_line', :bl, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', :spu, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "bl": business_line,
                    "spu": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM task_documents"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_assigned_employee_sees_own_document(client: AsyncClient) -> None:
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    employee_uuid = await _seed_staff_profile("employee", "loans")
    document_id = await _seed_task_with_document("loans", raiser_uuid, employee_uuid)

    rows = await _select_documents_as(staff_profile_uuid=employee_uuid)
    assert document_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_raiser_sees_nothing(client: AsyncClient) -> None:
    """Document collection is the assigned employee's own work — the
    telecaller who raised the task has no read access to what was collected."""
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    employee_uuid = await _seed_staff_profile("employee", "loans")
    await _seed_task_with_document("loans", raiser_uuid, employee_uuid)

    rows = await _select_documents_as(staff_profile_uuid=raiser_uuid)
    assert rows == []


@pytest.mark.asyncio
async def test_unrelated_same_line_employee_sees_nothing(client: AsyncClient) -> None:
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    employee_uuid = await _seed_staff_profile("employee", "loans")
    other_employee_uuid = await _seed_staff_profile("employee", "loans")
    await _seed_task_with_document("loans", raiser_uuid, employee_uuid)

    rows = await _select_documents_as(staff_profile_uuid=other_employee_uuid)
    assert rows == []


@pytest.mark.asyncio
async def test_cross_line_employee_sees_nothing(client: AsyncClient) -> None:
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    employee_uuid = await _seed_staff_profile("employee", "loans")
    re_employee_uuid = await _seed_staff_profile("employee", "real_estate")
    await _seed_task_with_document("loans", raiser_uuid, employee_uuid)

    rows = await _select_documents_as(
        staff_profile_uuid=re_employee_uuid, business_line="real_estate"
    )
    assert rows == []


@pytest.mark.asyncio
async def test_platform_scope_sees_all(client: AsyncClient) -> None:
    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    employee_uuid = await _seed_staff_profile("employee", "loans")
    document_id = await _seed_task_with_document("loans", raiser_uuid, employee_uuid)

    rows = await _select_documents_as(platform_scope="true")
    assert document_id in [str(r["id"]) for r in rows]
