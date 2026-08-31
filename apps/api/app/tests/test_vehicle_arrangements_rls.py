"""Direct PostgreSQL RLS checks for vehicle-arrangement ownership and assignment."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import full_registration, unique_mobile


async def _user_id_for_mobile(mobile: str) -> str:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        return str(
            await db.scalar(
                text("SELECT id FROM auth_users WHERE mobile = :mobile"), {"mobile": mobile}
            )
        )


async def _seed_employee(line: str) -> tuple[str, str]:
    import app.db.session as session_module
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with session_module.AsyncSessionLocal() as db:
        user = User(
            first_name="RLS",
            last_name="Employee",
            mobile=unique_mobile(),
            email=f"rls_vehicle_{uuid.uuid4().hex[:10]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.EMPLOYEE,
            scope=ProfileScope.LINE,
            business_line=line,
            staff_code=f"RV-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _select_as(
    *,
    user_uuid: str,
    role: str,
    business_line: str = "",
    staff_profile_uuid: str = "",
    platform_scope: str = "line",
) -> list[str]:
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
                    "set_config('app.auth_user_uuid', :uid, true),"
                    "set_config('app.role', :role, true),"
                    "set_config('app.business_line', :line, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', :staff, true),"
                    "set_config('app.platform_scope', :scope, true)"
                ),
                {
                    "uid": user_uuid,
                    "role": role,
                    "line": business_line,
                    "staff": staff_profile_uuid,
                    "scope": platform_scope,
                },
            )
            rows = await conn.execute(text("SELECT id FROM vehicle_arrangements"))
            return [str(row[0]) for row in rows]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_owner_assignee_and_platform_admin_visibility(
    client: AsyncClient, active_property_id: str
) -> None:
    owner_token, owner_mobile = await full_registration(client, lines=["real_estate"])
    _, other_mobile = await full_registration(client, lines=["real_estate"])
    created = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "property_ref": active_property_id,
            "title": "RLS Property",
            "locality": "Whitefield",
            "city": "Bengaluru",
            "contact_name": "Owner",
            "contact_mobile": "+919876543210",
            "preferred_date": (datetime.now(UTC) + timedelta(days=2)).date().isoformat(),
            "preferred_time_slot": "morning",
            "pickup_requested": True,
            "pickup_location": "MG Road",
            "pickup_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        },
    )
    arrangement_id = created.json()["vehicle_arrangement"]["id"]
    owner_id = await _user_id_for_mobile(owner_mobile)
    other_id = await _user_id_for_mobile(other_mobile)
    employee_user_id, employee_profile_id = await _seed_employee("real_estate")
    cross_user_id, cross_profile_id = await _seed_employee("loans")

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        await db.execute(
            text(
                "UPDATE vehicle_arrangements SET assigned_employee_profile_uuid = :employee "
                "WHERE id = :id"
            ),
            {"employee": employee_profile_id, "id": arrangement_id},
        )
        await db.commit()

    assert arrangement_id in await _select_as(user_uuid=owner_id, role="client")
    assert await _select_as(user_uuid=other_id, role="client") == []
    assert arrangement_id in await _select_as(
        user_uuid=employee_user_id,
        role="employee",
        business_line="real_estate",
        staff_profile_uuid=employee_profile_id,
    )
    assert (
        await _select_as(
            user_uuid=cross_user_id,
            role="employee",
            business_line="loans",
            staff_profile_uuid=cross_profile_id,
        )
        == []
    )
    assert arrangement_id in await _select_as(
        user_uuid=str(uuid.uuid4()), role="admin", platform_scope="true"
    )
