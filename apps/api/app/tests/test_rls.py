"""RLS integration tests — verify row-level isolation between users.

These tests require a running Docker stack (Postgres + Redis) with the
RLS migration (f2e4d6c8a0b1) applied.  They auto-skip otherwise.

Strategy: register two users via the API (superuser path, bypasses RLS),
then open a raw connection as api_user with user A's RLS context set and
assert that user B's auth_users row is NOT visible.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import full_registration

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _raw_select_as_api_user(
    *,
    acting_uuid: str,
    role: str = "client",
    platform_scope: str = "false",
    business_line: str = "",
    query: str,
    params: dict | None = None,
) -> list[dict]:
    """Open a fresh connection, drop to api_user, set RLS context, run query."""
    # Bypass pgBouncer (transaction-mode pooling intermittently drops the connection
    # during setup under load) — connect straight to Postgres, same as conftest/alembic.
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
                "uuid": acting_uuid,
                "role": role,
                "bl": business_line,
                "ps": platform_scope,
            },
        )
        result = await conn.execute(text(query), params or {})
        keys = list(result.keys())
        rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
    await engine.dispose()
    return rows


async def _get_user_id(client: AsyncClient, mobile: str) -> str:
    """Look up auth_users.id by mobile using the superuser connection (bypasses RLS)."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(
            text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile}
        )
        row = result.fetchone()
        assert row is not None, f"User with mobile {mobile} not found"
        return str(row[0])


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rls_migration_applied(client: AsyncClient) -> None:
    """Verify RLS is enabled on auth_users (api_user role must exist)."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                "SELECT rowsecurity FROM pg_tables "
                "WHERE tablename = 'auth_users' AND schemaname = 'public'"
            )
        )
        row = result.fetchone()

    assert row is not None, "auth_users table not found"
    assert row[0] is True, "RLS not enabled on auth_users — run migration f2e4d6c8a0b1"


@pytest.mark.asyncio
async def test_api_user_role_exists(client: AsyncClient) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(text("SELECT 1 FROM pg_roles WHERE rolname = 'api_user'"))
        row = result.fetchone()

    assert row is not None, "api_user role not found — run migration f2e4d6c8a0b1"


@pytest.mark.asyncio
async def test_user_cannot_see_other_users_row(client: AsyncClient) -> None:
    """User A querying auth_users as api_user must not see user B's row."""
    from conftest import unique_mobile

    mobile_a = unique_mobile()
    mobile_b = unique_mobile()

    _, _ = await full_registration(client, mobile=mobile_a)
    _, _ = await full_registration(client, mobile=mobile_b)

    uuid_a = await _get_user_id(client, mobile_a)
    uuid_b = await _get_user_id(client, mobile_b)

    rows = await _raw_select_as_api_user(
        acting_uuid=uuid_a,
        query="SELECT id::text FROM auth_users",
    )
    visible_ids = {r["id"] for r in rows}

    assert uuid_a in visible_ids, "User A cannot see their own row (RLS too strict)"
    assert uuid_b not in visible_ids, "User A can see user B's row (RLS not enforced)"


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all(client: AsyncClient) -> None:
    """platform_scope=true (Admin) bypasses RLS and sees all rows."""
    from conftest import unique_mobile

    mobile_a = unique_mobile()
    mobile_b = unique_mobile()

    _, _ = await full_registration(client, mobile=mobile_a)
    _, _ = await full_registration(client, mobile=mobile_b)

    uuid_a = await _get_user_id(client, mobile_a)
    uuid_b = await _get_user_id(client, mobile_b)

    rows = await _raw_select_as_api_user(
        acting_uuid=uuid_a,
        role="admin",
        platform_scope="true",
        query="SELECT id::text FROM auth_users",
    )
    visible_ids = {r["id"] for r in rows}

    assert uuid_a in visible_ids
    assert uuid_b in visible_ids, "Admin cannot see all users — platform_scope bypass broken"


@pytest.mark.asyncio
async def test_sub_admin_platform_scope_cannot_see_other_users(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: the platform_scope bypass is admin-only now."""
    from conftest import unique_mobile

    mobile_a = unique_mobile()
    mobile_b = unique_mobile()

    _, _ = await full_registration(client, mobile=mobile_a)
    _, _ = await full_registration(client, mobile=mobile_b)

    uuid_a = await _get_user_id(client, mobile_a)
    uuid_b = await _get_user_id(client, mobile_b)

    rows = await _raw_select_as_api_user(
        acting_uuid=uuid_a,
        role="sub_admin",
        platform_scope="true",
        query="SELECT id::text FROM auth_users",
    )
    visible_ids = {r["id"] for r in rows}

    assert uuid_a in visible_ids, "sub_admin cannot see their own row"
    assert uuid_b not in visible_ids, "sub_admin can see another user's row via platform_scope"


@pytest.mark.asyncio
async def test_rls_context_reinstalled_after_commit(client: AsyncClient) -> None:
    """Regression: the RLS context must survive a mid-request commit.

    SET LOCAL ROLE + set_config are transaction-local; services own their commit.
    Without the after_begin re-install, the post-commit transaction runs as the
    `app` superuser with RLS disabled and would leak every user's row. This drives
    the app's own session (so the global after_begin listener fires), sets user
    A's context, commits, then queries again and asserts B is still invisible.
    """
    from app.core.deps import _set_rls_context
    from conftest import unique_mobile

    mobile_a = unique_mobile()
    mobile_b = unique_mobile()
    await full_registration(client, mobile=mobile_a)
    await full_registration(client, mobile=mobile_b)
    uuid_a = await _get_user_id(client, mobile_a)
    uuid_b = await _get_user_id(client, mobile_b)

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
    session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    query = text("SELECT id::text AS id FROM auth_users")
    try:
        async with session_factory() as db:
            await _set_rls_context(
                db,
                user_uuid=uuid_a,
                role="client",
                business_line="both",
                client_profile_uuid="",
                agent_profile_uuid="",
                staff_profile_uuid="",
                platform_scope="false",
            )
            before = {r["id"] for r in (await db.execute(query)).mappings().all()}
            await db.commit()  # ends the transaction the context was set in
            after = {r["id"] for r in (await db.execute(query)).mappings().all()}
    finally:
        await engine.dispose()

    assert uuid_a in before and uuid_b not in before, "RLS not enforced in the first transaction"
    assert uuid_a in after, "own row not visible after commit"
    assert uuid_b not in after, (
        "post-commit query leaked another user's row — RLS context not re-installed"
    )


@pytest.mark.asyncio
async def test_client_profiles_isolated_by_owner(client: AsyncClient) -> None:
    """User A cannot see user B's client_profiles row."""
    from conftest import unique_mobile

    mobile_a = unique_mobile()
    mobile_b = unique_mobile()

    _, _ = await full_registration(client, mobile=mobile_a, lines=["loans"])
    _, _ = await full_registration(client, mobile=mobile_b, lines=["loans"])

    uuid_a = await _get_user_id(client, mobile_a)
    uuid_b = await _get_user_id(client, mobile_b)

    rows = await _raw_select_as_api_user(
        acting_uuid=uuid_a,
        query="SELECT auth_user_uuid::text FROM client_profiles",
    )
    visible_owners = {r["auth_user_uuid"] for r in rows}

    assert uuid_a in visible_owners, "User A cannot see their own client_profile"
    assert uuid_b not in visible_owners, "User A can see user B's client_profile"
