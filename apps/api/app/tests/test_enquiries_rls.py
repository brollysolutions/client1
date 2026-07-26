"""enquiries RLS — identity-level owner isolation + real-estate line-staff branch.

Verifies migration 4d5e6f7a8b9c's hybrid policy: a client sees only their own
enquiry, another client sees none, a real-estate telecaller/employee/
sub_admin/agent sees it, a loans-only staff member sees NONE of it
(cross-line), and platform_scope (Admin/Sub Admin) sees all. Mirrors
test_site_visits_rls.py's harness.

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
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


async def _seed_enquiry(user_uuid: str) -> str:
    """Insert an enquiry via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.enquiry import Enquiry

    async with _session_mod.AsyncSessionLocal() as db:
        enquiry = Enquiry(
            user_uuid=uuid.UUID(user_uuid),
            business_line="real_estate",
            property_ref="prop-1",
            title="2BHK Apartment",
            locality="Indiranagar",
            city="Bengaluru",
            contact_name="Test Client",
            contact_mobile="+919876543210",
        )
        db.add(enquiry)
        await db.commit()
        return str(enquiry.id)


async def _select_as(
    *,
    auth_user_uuid: str = "",
    role: str = "client",
    business_line: str = "",
    platform_scope: str = "false",
) -> list[dict]:
    """Open a fresh connection, drop to api_user, set the RLS context, list rows."""
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
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": auth_user_uuid or str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM enquiries"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_client_sees_own_enquiry(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    enquiry_id = await _seed_enquiry(uid)

    rows = await _select_as(auth_user_uuid=uid)
    assert [r["id"] for r in rows] == [uuid.UUID(enquiry_id)]


@pytest.mark.asyncio
async def test_other_client_cannot_see_it(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    await _seed_enquiry(owner_uid)

    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid)
    assert rows == []


@pytest.mark.asyncio
async def test_real_estate_telecaller_can_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    enquiry_id = await _seed_enquiry(uid)

    rows = await _select_as(role="telecaller", business_line="real_estate")
    assert uuid.UUID(enquiry_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_real_estate_employee_can_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    enquiry_id = await _seed_enquiry(uid)

    rows = await _select_as(role="employee", business_line="real_estate")
    assert uuid.UUID(enquiry_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_real_estate_sub_admin_can_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    enquiry_id = await _seed_enquiry(uid)

    rows = await _select_as(role="sub_admin", business_line="real_estate")
    assert uuid.UUID(enquiry_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_real_estate_agent_can_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    enquiry_id = await _seed_enquiry(uid)

    rows = await _select_as(role="agent", business_line="real_estate")
    assert uuid.UUID(enquiry_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_loans_only_staff_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    await _seed_enquiry(uid)

    rows = await _select_as(role="telecaller", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    enquiry_id = await _seed_enquiry(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(enquiry_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_sub_admin_platform_scope_cross_line_cannot_see_it(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: the platform_scope bypass is admin-only now. Uses a
    cross-line business_line so the pre-existing line-scoped sub_admin branch
    (role IN (...,'sub_admin') AND business_line match) cannot mask a bypass
    regression — this must be denied for a reason unrelated to line match."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    enquiry_id = await _seed_enquiry(uid)

    rows = await _select_as(role="sub_admin", business_line="loans", platform_scope="true")
    assert uuid.UUID(enquiry_id) not in [r["id"] for r in rows]
