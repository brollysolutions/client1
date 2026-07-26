"""push_subscriptions access control — bypass-session-only, zero api_user grants.

Unlike notifications (owner-visible via RLS to api_user's own request
session), push_subscriptions is written and read ONLY through the bypass
superuser session (services/push.py) — api_user (the role every
authenticated request runs as) holds NO grants on this table at all, so RLS
visibility as api_user isn't merely restricted, it's structurally
unreachable: any query api_user attempts fails at the GRANT layer before RLS
policy evaluation is even relevant. That's the actual invariant this file
proves, in place of the "owner sees own, admin bypass narrowed" shape used
for notifications (a0b1c2d3e4f5) — here there's no bypass branch to narrow
because there was never a grant to reach it through.

The owner-only RLS policy is still enabled (see models/push_subscription.py)
purely as defense-in-depth for if a grant is ever added later; it isn't
independently exercisable while there's no grant to reach it with, so
`test_policy_exists_as_defense_in_depth` just confirms it's actually present
in the catalog rather than silently missing.

Requires the Docker stack with migrations applied; auto-skips without Redis.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
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


async def _seed_subscription(user_uuid: str) -> str:
    """Insert via the app superuser (bypasses RLS/grants) — the same path
    services.push.upsert_subscription uses for real."""
    import app.db.session as _session_mod
    from app.models.push_subscription import PushSubscription

    async with _session_mod.AsyncSessionLocal() as db:
        subscription = PushSubscription(
            user_uuid=uuid.UUID(user_uuid),
            endpoint=f"https://push.example.com/{uuid.uuid4().hex}",
            p256dh="p256dh-key",
            auth="auth-secret",
        )
        db.add(subscription)
        await db.commit()
        return str(subscription.id)


async def _select_as_api_user(*, auth_user_uuid: str, role: str = "client") -> None:
    """Open a fresh connection, drop to api_user, attempt to read the table.
    Expected to always raise InsufficientPrivilege (permission denied) —
    there is no grant for api_user to reach, regardless of role."""
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
                    "SELECT set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', :role, true),"
                    "set_config('app.platform_scope', 'false', true)"
                ),
                {"uuid": auth_user_uuid, "role": role},
            )
            await conn.execute(text("SELECT id FROM push_subscriptions"))
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_api_user_cannot_read_own_subscription(client: AsyncClient) -> None:
    """Even the owner's own row is unreachable via the request-session role —
    on purpose: reads only ever happen through the bypass session."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    await _seed_subscription(uid)

    with pytest.raises(ProgrammingError, match="permission denied"):
        await _select_as_api_user(auth_user_uuid=uid)


@pytest.mark.asyncio
async def test_api_user_cannot_read_as_admin(client: AsyncClient) -> None:
    """No platform_scope bypass grant either — admin gets the same permission
    denial as any other role."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    await _seed_subscription(uid)

    with pytest.raises(ProgrammingError, match="permission denied"):
        await _select_as_api_user(auth_user_uuid=uid, role="admin")


@pytest.mark.asyncio
async def test_policy_exists_as_defense_in_depth() -> None:
    """The owner-only RLS policy is enabled even though no grant currently
    reaches it — confirms it's actually present, not silently dropped."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT polname, polpermissive, pg_get_expr(polqual, polrelid) AS using_expr "
                    "FROM pg_policy WHERE polname = 'push_subscriptions_rls'"
                )
            )
        ).fetchone()
        assert row is not None, "push_subscriptions_rls policy is missing"
        assert "auth_user_uuid" in row.using_expr

        rls_enabled = (
            await db.execute(
                text("SELECT relrowsecurity FROM pg_class WHERE relname = 'push_subscriptions'")
            )
        ).scalar_one()
        assert rls_enabled is True
