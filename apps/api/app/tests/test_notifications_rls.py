"""notifications RLS — identity-level owner isolation, NO staff branch.

Verifies migration 6f7a8b9c1d2e's owner-only policy: a client sees only their
own notification, another client sees none, non-owner staff/agent see none
(account-level, no business_line branch), and platform_scope (Admin/Sub
Admin) sees all. Mirrors test_bookmarks_rls.py's harness (the owner-only
shape shared with support_tickets).

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


async def _seed_notification(user_uuid: str) -> str:
    """Insert a notification via the app superuser (bypasses RLS) — same
    mechanism the real emit_notification producer uses."""
    import app.db.session as _session_mod
    from app.models.notification import Notification, NotificationType

    async with _session_mod.AsyncSessionLocal() as db:
        notification = Notification(
            user_uuid=uuid.UUID(user_uuid),
            type=NotificationType.SITE_VISIT_REQUESTED,
            title="Site visit requested",
            body="We've received your request.",
        )
        db.add(notification)
        await db.commit()
        return str(notification.id)


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
            result = await conn.execute(text("SELECT id FROM notifications"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_client_sees_own_notification(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    notification_id = await _seed_notification(uid)

    rows = await _select_as(auth_user_uuid=uid)
    assert [r["id"] for r in rows] == [uuid.UUID(notification_id)]


@pytest.mark.asyncio
async def test_other_client_cannot_see_it(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    await _seed_notification(owner_uid)

    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid)
    assert rows == []


@pytest.mark.asyncio
async def test_real_estate_telecaller_cannot_see_it(client: AsyncClient) -> None:
    """Account-level, no staff/business_line branch — unlike site_visits."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    await _seed_notification(uid)

    rows = await _select_as(role="telecaller", business_line="real_estate")
    assert rows == []


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    notification_id = await _seed_notification(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(notification_id) in [r["id"] for r in rows]
