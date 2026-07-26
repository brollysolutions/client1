"""support_tickets RLS — identity-level row isolation between clients.

Verifies migration 3c4d5e6f7a8b's policy: a client sees only their own tickets,
another client sees none, and platform_scope (Admin/Sub Admin) sees all. Unlike
loans, this table has no business_line, so there are no line-staff cases — the
owner branch keys on app.auth_user_uuid.

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


async def _seed_ticket(auth_user_uuid: str) -> str:
    """Insert a support_ticket via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.support_ticket import SupportCategory, SupportTicket

    async with _session_mod.AsyncSessionLocal() as db:
        ticket = SupportTicket(
            auth_user_uuid=uuid.UUID(auth_user_uuid),
            category=SupportCategory.GENERAL,
            subject="Need help",
            body="Something went wrong.",
        )
        db.add(ticket)
        await db.commit()
        return str(ticket.id)


async def _select_as(
    *,
    auth_user_uuid: str = "",
    role: str = "client",
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
                    "set_config('app.business_line', '', true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', '', true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": auth_user_uuid or str(uuid.uuid4()),
                    "role": role,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM support_tickets"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_client_sees_own_ticket(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(uid)

    rows = await _select_as(auth_user_uuid=uid)
    assert [r["id"] for r in rows] == [uuid.UUID(ticket_id)]


@pytest.mark.asyncio
async def test_other_client_cannot_see_it(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    await _seed_ticket(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid)
    assert rows == []


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(ticket_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_sub_admin_platform_scope_cannot_see_it(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: the platform_scope bypass is admin-only now."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(uid)

    rows = await _select_as(role="sub_admin", platform_scope="true")
    assert uuid.UUID(ticket_id) not in [r["id"] for r in rows]
