"""Agent-origin leads RLS — an agent must see/write only their own-originated,
own-line, still-unassigned leads.

Migration a9b8c7d6e5f4 adds an 'agent' branch to leads_rls scoped to
origin_agent_profile_uuid = self (mirrors e6c7b8f9a0d1's telecaller-scoping
approach, keyed on a different column since Lead has no
assigned_agent_profile_uuid). WITH CHECK additionally requires
assigned_telecaller_profile_uuid IS NULL: once a telecaller has the lead, the
introducing agent can still SELECT it (read-only tracking) but not UPDATE it.

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
    business_line: str,
    origin_agent_profile_uuid: str | None = None,
    assigned_telecaller_profile_uuid: str | None = None,
) -> str:
    """Insert a lead via the app superuser (bypasses RLS). Returns its id."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=(
                LeadStatus.NEW if assigned_telecaller_profile_uuid is None else LeadStatus.ASSIGNED
            ),
            origin=LeadOrigin.AGENT if origin_agent_profile_uuid else LeadOrigin.DIRECT,
            origin_agent_profile_uuid=(
                uuid.UUID(origin_agent_profile_uuid) if origin_agent_profile_uuid else None
            ),
            assigned_telecaller_profile_uuid=(
                uuid.UUID(assigned_telecaller_profile_uuid)
                if assigned_telecaller_profile_uuid
                else None
            ),
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_agent_profile(business_line: str = "loans") -> str:
    """Insert an AgentProfile via the app superuser. Returns its id."""
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"ag_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line=business_line,
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _seed_telecaller_staff_profile(business_line: str = "loans") -> str:
    """Insert a StaffProfile (role=telecaller) via the app superuser. Returns its
    id. Needed because leads.assigned_telecaller_profile_uuid has a real FK to
    staff_profiles.id — a bare random UUID violates it on insert."""
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
    agent_profile_uuid: str = "",
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
                    "set_config('app.agent_profile_uuid', :agent_uuid, true),"
                    "set_config('app.staff_profile_uuid', :staff_uuid, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "agent_uuid": agent_profile_uuid,
                    "staff_uuid": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text(query), params)
            return result.rowcount
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_agent_can_update_own_unassigned_lead(client: AsyncClient) -> None:
    agent_uuid = await _seed_agent_profile("loans")
    lead_id = await _seed_lead("loans", origin_agent_profile_uuid=agent_uuid)
    rowcount = await _run_as(
        role="agent",
        business_line="loans",
        agent_profile_uuid=agent_uuid,
        query="UPDATE leads SET name = 'Updated' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 1, "agent could not update their own unassigned lead"


@pytest.mark.asyncio
async def test_agent_cannot_update_after_telecaller_assigned(client: AsyncClient) -> None:
    """The row IS visible under USING (agent's origin_agent_profile_uuid still
    matches), so the UPDATE finds it and Postgres evaluates WITH CHECK on the
    new row — which fails and raises, rather than silently matching 0 rows.
    Same shape as the sibling test_leads_rls.py::test_line_staff_cannot_move_lead_across_lines."""
    agent_uuid = await _seed_agent_profile("loans")
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead(
        "loans",
        origin_agent_profile_uuid=agent_uuid,
        assigned_telecaller_profile_uuid=staff_uuid,
    )
    with pytest.raises(Exception):  # noqa: B017 — asyncpg raises a row-security violation
        await _run_as(
            role="agent",
            business_line="loans",
            agent_profile_uuid=agent_uuid,
            query="UPDATE leads SET name = 'Updated' WHERE id = :id",
            params={"id": lead_id},
        )


@pytest.mark.asyncio
async def test_agent_can_still_select_after_telecaller_assigned(client: AsyncClient) -> None:
    """USING stays permissive after assignment — read-only tracking, not invisible."""
    agent_uuid = await _seed_agent_profile("loans")
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead(
        "loans",
        origin_agent_profile_uuid=agent_uuid,
        assigned_telecaller_profile_uuid=staff_uuid,
    )
    rowcount = await _run_as(
        role="agent",
        business_line="loans",
        agent_profile_uuid=agent_uuid,
        query="SELECT 1 FROM leads WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 1, "agent lost visibility of their own lead after telecaller assignment"


@pytest.mark.asyncio
async def test_agent_cannot_see_other_agents_lead(client: AsyncClient) -> None:
    owner_uuid = await _seed_agent_profile("loans")
    other_uuid = await _seed_agent_profile("loans")
    lead_id = await _seed_lead("loans", origin_agent_profile_uuid=owner_uuid)
    rowcount = await _run_as(
        role="agent",
        business_line="loans",
        agent_profile_uuid=other_uuid,
        query="SELECT 1 FROM leads WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "an agent saw another agent's lead"


@pytest.mark.asyncio
async def test_agent_cannot_see_cross_line_lead_even_if_attributed(client: AsyncClient) -> None:
    """business_line must gate the agent branch: a lead attributed to this agent
    but on the OTHER business line must stay invisible (line segregation)."""
    agent_uuid = await _seed_agent_profile("loans")
    lead_id = await _seed_lead("real_estate", origin_agent_profile_uuid=agent_uuid)
    rowcount = await _run_as(
        role="agent",
        business_line="loans",
        agent_profile_uuid=agent_uuid,
        query="SELECT 1 FROM leads WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "loans agent saw a real-estate-line lead attributed to them"


@pytest.mark.asyncio
async def test_agent_cannot_see_direct_origin_lead(client: AsyncClient) -> None:
    """origin_agent_profile_uuid IS NULL must not match any agent (no accidental
    wildcard from a blank current_setting)."""
    agent_uuid = await _seed_agent_profile("loans")
    lead_id = await _seed_lead("loans")  # direct origin, no agent attribution
    rowcount = await _run_as(
        role="agent",
        business_line="loans",
        agent_profile_uuid=agent_uuid,
        query="SELECT 1 FROM leads WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "agent saw a direct-origin lead with no attribution"


@pytest.mark.asyncio
async def test_telecaller_branch_unaffected_by_agent_migration(client: AsyncClient) -> None:
    """Regression guard: migration a9b8c7d6e5f4 must not touch the telecaller branch."""
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    lead_id = await _seed_lead("loans", assigned_telecaller_profile_uuid=staff_uuid)
    rowcount = await _run_as(
        role="telecaller",
        business_line="loans",
        staff_profile_uuid=staff_uuid,
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 1, "telecaller lost write access to their assigned lead"
