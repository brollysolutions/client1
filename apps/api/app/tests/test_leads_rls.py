"""Leads RLS write tests — line staff must be able to work their own-line leads.

Audit finding D1: leads_rls USING lets line telecaller/employee/sub_admin SELECT
leads in their business_line, but the original WITH CHECK blocked their writes, so
progressing a lead (new -> working) raised a row-security violation. Migration
d4a1b2c3e5f6 mirrors the line-staff predicate into WITH CHECK.

Migration e6c7b8f9a0d1 (Telecaller Dashboard slice 1) then narrows the telecaller
branch specifically to `assigned_telecaller_profile_uuid = self` — a telecaller
must not see/write another telecaller's lead, or an unassigned one, even on their
own line. employee/sub_admin are unchanged (still whole-line).

Requires the Docker stack with migrations applied; auto-skips without Redis.
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


async def _seed_lead(
    business_line: str, status: str = "new", assigned_telecaller_profile_uuid: str | None = None
) -> str:
    """Insert a lead via the app superuser (bypasses RLS). Returns its id."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus(status),
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=(
                uuid.UUID(assigned_telecaller_profile_uuid)
                if assigned_telecaller_profile_uuid
                else None
            ),
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_telecaller_staff_profile(business_line: str = "loans") -> str:
    """Insert a StaffProfile (role=telecaller) via the app superuser. Returns its id."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _run_as(
    *,
    role: str,
    business_line: str = "",
    staff_profile_uuid: str = "",
    platform_scope: str = "false",
    query: str,
    params: dict,
) -> int:
    """Run a query as api_user with the given RLS context. Returns rowcount."""
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
                    "set_config('app.staff_profile_uuid', :staff_uuid, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "staff_uuid": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text(query), params)
            return result.rowcount
    finally:
        await engine.dispose()


async def _update_as_line_staff(
    *,
    role: str,
    business_line: str,
    staff_profile_uuid: str = "",
    query: str,
    params: dict,
) -> int:
    return await _run_as(
        role=role,
        business_line=business_line,
        staff_profile_uuid=staff_profile_uuid,
        query=query,
        params=params,
    )


@pytest.mark.asyncio
async def test_line_telecaller_can_progress_own_assigned_lead(client: AsyncClient) -> None:
    """A loans telecaller must be able to move THEIR OWN assigned loans lead new -> working (D1)."""
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead("loans", "assigned", assigned_telecaller_profile_uuid=staff_uuid)
    rowcount = await _update_as_line_staff(
        role="telecaller",
        business_line="loans",
        staff_profile_uuid=staff_uuid,
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 1, "line telecaller could not update their own assigned lead"


@pytest.mark.asyncio
async def test_line_telecaller_cannot_touch_other_line_lead(client: AsyncClient) -> None:
    """A real_estate telecaller must not see/update a loans lead (USING filters it)."""
    staff_uuid = await _seed_telecaller_staff_profile("real_estate")
    lead_id = await _seed_lead("loans", "assigned", assigned_telecaller_profile_uuid=staff_uuid)
    rowcount = await _update_as_line_staff(
        role="telecaller",
        business_line="real_estate",
        staff_profile_uuid=staff_uuid,
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "cross-line telecaller updated a lead outside their business_line"


@pytest.mark.asyncio
async def test_line_staff_cannot_move_lead_across_lines(client: AsyncClient) -> None:
    """WITH CHECK pins the line: a loans telecaller cannot flip a lead to real_estate."""
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead("loans", "assigned", assigned_telecaller_profile_uuid=staff_uuid)
    with pytest.raises(Exception):  # noqa: B017 — asyncpg raises a row-security violation
        await _update_as_line_staff(
            role="telecaller",
            business_line="loans",
            staff_profile_uuid=staff_uuid,
            query="UPDATE leads SET business_line = 'real_estate' WHERE id = :id",
            params={"id": lead_id},
        )


@pytest.mark.asyncio
async def test_unassigned_lead_invisible_to_telecaller(client: AsyncClient) -> None:
    """An unassigned own-line lead must not be visible/writable by any telecaller."""
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead("loans", "new")  # no assignment
    rowcount = await _update_as_line_staff(
        role="telecaller",
        business_line="loans",
        staff_profile_uuid=staff_uuid,
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "telecaller updated an unassigned lead"


@pytest.mark.asyncio
async def test_other_telecallers_lead_invisible(client: AsyncClient) -> None:
    """Another telecaller's assigned lead (same line) must be invisible."""
    owner_uuid = await _seed_telecaller_staff_profile("loans")
    other_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead("loans", "assigned", assigned_telecaller_profile_uuid=owner_uuid)
    rowcount = await _update_as_line_staff(
        role="telecaller",
        business_line="loans",
        staff_profile_uuid=other_uuid,
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "a telecaller updated another telecaller's assigned lead"


@pytest.mark.asyncio
async def test_employee_still_sees_whole_line(client: AsyncClient) -> None:
    """Regression guard: migration e6c7b8f9a0d1 must not touch the employee branch."""
    lead_id = await _seed_lead("loans", "new")  # unassigned, no telecaller involved
    rowcount = await _update_as_line_staff(
        role="employee",
        business_line="loans",
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 1, "employee lost whole-line access to an unassigned lead"


@pytest.mark.asyncio
async def test_sub_admin_still_sees_whole_line(client: AsyncClient) -> None:
    """Regression guard: migration e6c7b8f9a0d1 must not touch the sub_admin branch."""
    lead_id = await _seed_lead("loans", "new")
    rowcount = await _update_as_line_staff(
        role="sub_admin",
        business_line="loans",
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 1, "sub_admin lost whole-line access to an unassigned lead"


@pytest.mark.asyncio
async def test_sub_admin_platform_scope_cross_line_cannot_write(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: the platform_scope bypass is admin-only now. Cross-line
    business_line so the pre-existing line-scoped sub_admin branch (unchanged
    by this migration) cannot mask a bypass regression — this must be denied
    for a reason unrelated to line match."""
    lead_id = await _seed_lead("loans", "new")
    rowcount = await _run_as(
        role="sub_admin",
        business_line="real_estate",
        platform_scope="true",
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "sub_admin wrote a cross-line lead via the platform_scope bypass"
