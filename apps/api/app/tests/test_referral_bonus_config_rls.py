"""referral_bonus_config RLS — shared sub_admin visibility + narrow allowlist.

Verifies migration f9a0b1c2d3e4: sub_admin sees EVERY config (shared
content-team surface), admin sees every config too (read-only oversight), and
every other role (telecaller/employee/agent/client) sees NOTHING — denial by
absence of a grant, not a filtered policy. Also checks INSERT WITH CHECK (only
sub_admin, only owning their own row) and that UPDATE is rejected for a
non-owner sub_admin. Mirrors test_offers_rls.py's harness.
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


async def _seed_config(created_by_uuid: str) -> str:
    """Insert a config via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.referral_bonus_config import ReferralBonusConfig

    async with _session_mod.AsyncSessionLocal() as db:
        config = ReferralBonusConfig(
            business_line="loans",
            bonus_amount=500,
            rule={"min_conversion": 1},
            active=True,
            created_by_uuid=uuid.UUID(created_by_uuid),
        )
        db.add(config)
        await db.commit()
        return str(config.id)


def _engine():
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    return create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )


async def _set_context(conn, auth_user_uuid: str, role: str, business_line: str, ps: str) -> None:
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
        {"uuid": auth_user_uuid, "role": role, "bl": business_line, "ps": ps},
    )


async def _select_as(
    *,
    auth_user_uuid: str = "",
    role: str = "client",
    business_line: str = "",
    platform_scope: str = "false",
) -> list[dict]:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn, auth_user_uuid or str(uuid.uuid4()), role, business_line, platform_scope
            )
            result = await conn.execute(text("SELECT id FROM referral_bonus_config"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sub_admin_sees_every_config_not_just_own(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    config_id = await _seed_config(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid, role="sub_admin", platform_scope="true")
    assert uuid.UUID(config_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_admin_sees_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    config_id = await _seed_config(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(config_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_telecaller_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_config(uid)

    rows = await _select_as(role="telecaller", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_employee_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_config(uid)

    rows = await _select_as(role="employee", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_agent_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_config(uid)

    rows = await _select_as(role="agent", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_plain_client_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_config(uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)
    rows = await _select_as(auth_user_uuid=other_uid, role="client")
    assert rows == []


@pytest.mark.asyncio
async def test_insert_check_rejects_foreign_creator(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, uid, "sub_admin", "both", "true")
            with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                await conn.execute(
                    text(
                        "INSERT INTO referral_bonus_config "
                        "(id, business_line, bonus_amount, rule, active, created_by_uuid) "
                        "VALUES (gen_random_uuid(), 'loans', 500, '{}'::jsonb, true, "
                        "gen_random_uuid())"
                    )
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_platform_admin_can_insert(client: AsyncClient) -> None:
    """Platform Admin keeps the governed CMS override granted by the API."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, uid, "admin", "both", "true")
            result = await conn.execute(
                text(
                    "INSERT INTO referral_bonus_config "
                    "(id, business_line, bonus_amount, rule, active, created_by_uuid) "
                    "VALUES (gen_random_uuid(), 'loans', 500, '{}'::jsonb, true, :uuid)"
                ),
                {"uuid": uid},
            )
            assert result.rowcount == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_update_rejected_for_non_owner(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    config_id = await _seed_config(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, other_uid, "sub_admin", "both", "true")
            result = await conn.execute(
                text("UPDATE referral_bonus_config SET bonus_amount = 999 WHERE id = :id"),
                {"id": config_id},
            )
            # RLS USING clause excludes the row (not the owner) — zero-row no-op.
            assert result.rowcount == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_business_line_immutable_once_set(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    config_id = await _seed_config(uid)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, uid, "sub_admin", "both", "true")
            with pytest.raises(Exception):  # noqa: B017 — trigger check_violation
                await conn.execute(
                    text(
                        "UPDATE referral_bonus_config SET business_line = 'real_estate' "
                        "WHERE id = :id"
                    ),
                    {"id": config_id},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_api_user_has_no_write_grant_on_transactions(client: AsyncClient) -> None:
    """Payout execution stays Admin/finance's. A route-path naming check (e.g.
    "does any URL under this router contain the word 'transactions'") would
    miss a differently-named write endpoint that still issued an INSERT/UPDATE
    against the Transaction model internally. The real, durable guarantee is at
    the database grant level: api_user has never held INSERT/UPDATE/DELETE on
    transactions (7a8b9c1d2e3f granted SELECT only, unchanged since), so no
    application code — in this router or anywhere else — can write to it no
    matter what it's named. Assert that grant state directly."""
    engine = _engine()
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    "SELECT privilege_type FROM information_schema.role_table_grants "
                    "WHERE table_name = 'transactions' AND grantee = 'api_user'"
                )
            )
            privileges = {row[0] for row in result.fetchall()}
    finally:
        await engine.dispose()
    assert privileges == {"SELECT"}
