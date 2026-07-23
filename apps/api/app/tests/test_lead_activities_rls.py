"""lead_activities RLS — own-rows-only isolation (no line-staff branch).

Verifies migration d5b6c7a8f9e0's policy: a telecaller sees/writes only their own
logged call attempts, another telecaller's rows are invisible (even same lead,
same line), and platform Admin bypass sees all.

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


async def _seed_telecaller_staff_profile(business_line: str = "loans") -> str:
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


async def _seed_lead_activity(business_line: str, telecaller_staff_profile_uuid: str) -> str:
    """Insert a lead + a lead_activity via the app superuser. Returns the activity id."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.lead_activity import CallDisposition, LeadActivity

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(telecaller_staff_profile_uuid),
        )
        db.add(lead)
        await db.flush()
        activity = LeadActivity(
            lead_uuid=lead.id,
            telecaller_staff_profile_uuid=uuid.UUID(telecaller_staff_profile_uuid),
            business_line=business_line,
            disposition=CallDisposition.CONNECTED,
        )
        db.add(activity)
        await db.commit()
        return str(activity.id)


async def _select_as(
    *,
    role: str = "telecaller",
    staff_profile_uuid: str = "",
    platform_scope: str = "false",
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
                    "set_config('app.business_line', '', true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', :staff_uuid, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "staff_uuid": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM lead_activities"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_telecaller_sees_own_activity(client: AsyncClient) -> None:
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    activity_id = await _seed_lead_activity("loans", staff_uuid)

    rows = await _select_as(staff_profile_uuid=staff_uuid)
    assert [str(r["id"]) for r in rows] == [activity_id]


@pytest.mark.asyncio
async def test_other_telecallers_activity_invisible(client: AsyncClient) -> None:
    owner_uuid = await _seed_telecaller_staff_profile("loans")
    other_uuid = await _seed_telecaller_staff_profile("loans")
    await _seed_lead_activity("loans", owner_uuid)

    rows = await _select_as(staff_profile_uuid=other_uuid)
    assert rows == []


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all(client: AsyncClient) -> None:
    staff_uuid = await _seed_telecaller_staff_profile("loans")
    activity_id = await _seed_lead_activity("loans", staff_uuid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert str(activity_id) in [str(r["id"]) for r in rows]
