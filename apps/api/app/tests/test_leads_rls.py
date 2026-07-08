"""Leads RLS write tests — line staff must be able to work their own-line leads.

Audit finding D1: leads_rls USING lets line telecaller/employee/sub_admin SELECT
leads in their business_line, but the original WITH CHECK blocked their writes, so
progressing a lead (new -> working) raised a row-security violation. Migration
d4a1b2c3e5f6 mirrors the line-staff predicate into WITH CHECK.

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


async def _seed_lead(business_line: str, status: str = "new") -> str:
    """Insert a lead via the app superuser (bypasses RLS). Returns its id."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus(status),
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _update_as_line_staff(
    *,
    role: str,
    business_line: str,
    query: str,
    params: dict,
) -> int:
    """Run a write as api_user with a line-staff RLS context. Returns rowcount."""
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
                    "set_config('app.staff_profile_uuid', '', true),"
                    "set_config('app.platform_scope', 'false', true)"
                ),
                {"uuid": str(uuid.uuid4()), "role": role, "bl": business_line},
            )
            result = await conn.execute(text(query), params)
            return result.rowcount
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_line_telecaller_can_progress_own_line_lead(client: AsyncClient) -> None:
    """A loans telecaller must be able to move a loans lead new -> working (D1)."""
    lead_id = await _seed_lead("loans", "new")
    rowcount = await _update_as_line_staff(
        role="telecaller",
        business_line="loans",
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 1, "line telecaller could not update own-line lead (WITH CHECK too strict)"


@pytest.mark.asyncio
async def test_line_telecaller_cannot_touch_other_line_lead(client: AsyncClient) -> None:
    """A real_estate telecaller must not see/update a loans lead (USING filters it)."""
    lead_id = await _seed_lead("loans", "new")
    rowcount = await _update_as_line_staff(
        role="telecaller",
        business_line="real_estate",
        query="UPDATE leads SET status = 'working' WHERE id = :id",
        params={"id": lead_id},
    )
    assert rowcount == 0, "cross-line telecaller updated a lead outside their business_line"


@pytest.mark.asyncio
async def test_line_staff_cannot_move_lead_across_lines(client: AsyncClient) -> None:
    """WITH CHECK pins the line: a loans telecaller cannot flip a lead to real_estate."""
    lead_id = await _seed_lead("loans", "new")
    with pytest.raises(Exception):  # noqa: B017 — asyncpg raises a row-security violation
        await _update_as_line_staff(
            role="telecaller",
            business_line="loans",
            query="UPDATE leads SET business_line = 'real_estate' WHERE id = :id",
            params={"id": lead_id},
        )
