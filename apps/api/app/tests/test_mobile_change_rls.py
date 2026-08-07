"""RLS/grant boundary for support-assisted mobile-number recovery rows."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.mobile_change import MobileChangeRequest, MobileChangeSource
from app.models.support_ticket import SupportCategory, SupportTicket
from conftest import full_registration, unique_mobile


async def _user_id(mobile: str) -> uuid.UUID:
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        value = await db.scalar(
            text("SELECT id FROM auth_users WHERE mobile = :number"),
            {"number": mobile},
        )
        assert value is not None
        return value


async def _seed_request(user_id: uuid.UUID, current_mobile: str) -> uuid.UUID:
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        ticket = SupportTicket(
            auth_user_uuid=user_id,
            category=SupportCategory.LOST_MOBILE,
            subject="Mobile number change request",
            body="Structured recovery workflow.",
        )
        db.add(ticket)
        await db.flush()
        request = MobileChangeRequest(
            auth_user_uuid=user_id,
            support_ticket_uuid=ticket.id,
            source=MobileChangeSource.PUBLIC,
            current_mobile=current_mobile,
            requested_mobile=unique_mobile(),
            requested_mobile_verified_at=datetime.now(UTC),
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(request)
        await db.commit()
        return request.id


async def _with_api_user(
    *, auth_user_uuid: str = "", role: str = "client", platform_scope: str = "false"
) -> tuple[list[uuid.UUID], bool]:
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
                    "set_config('app.auth_user_uuid', :uid, true), "
                    "set_config('app.role', :role, true), "
                    "set_config('app.business_line', '', true), "
                    "set_config('app.client_profile_uuid', '', true), "
                    "set_config('app.agent_profile_uuid', '', true), "
                    "set_config('app.staff_profile_uuid', '', true), "
                    "set_config('app.platform_scope', :scope, true)"
                ),
                {
                    "uid": auth_user_uuid or str(uuid.uuid4()),
                    "role": role,
                    "scope": platform_scope,
                },
            )
            rows = list(await conn.scalars(text("SELECT id FROM mobile_change_requests")))
            update_denied = False
            savepoint = await conn.begin_nested()
            try:
                await conn.execute(
                    text("UPDATE mobile_change_requests SET status = 'completed' WHERE false")
                )
            except ProgrammingError:
                await savepoint.rollback()
                update_denied = True
            else:
                await savepoint.commit()
        return rows, update_denied
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_owner_can_read_but_cannot_update(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    user_id = await _user_id(mobile)
    request_id = await _seed_request(user_id, mobile)

    rows, update_denied = await _with_api_user(auth_user_uuid=str(user_id))
    assert request_id in rows
    assert update_denied is True


@pytest.mark.asyncio
async def test_other_client_cannot_read(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client)
    owner_id = await _user_id(owner_mobile)
    request_id = await _seed_request(owner_id, owner_mobile)
    _, other_mobile = await full_registration(client)
    other_id = await _user_id(other_mobile)

    rows, _ = await _with_api_user(auth_user_uuid=str(other_id))
    assert request_id not in rows


@pytest.mark.asyncio
async def test_platform_admin_can_read(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    user_id = await _user_id(mobile)
    request_id = await _seed_request(user_id, mobile)

    rows, _ = await _with_api_user(role="admin", platform_scope="true")
    assert request_id in rows


@pytest.mark.asyncio
async def test_platform_sub_admin_cannot_read(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    user_id = await _user_id(mobile)
    request_id = await _seed_request(user_id, mobile)

    rows, _ = await _with_api_user(role="sub_admin", platform_scope="true")
    assert request_id not in rows
