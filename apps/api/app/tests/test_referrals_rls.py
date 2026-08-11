"""referral_codes / referrals RLS — identity-keyed, admin-only bypass, no
sub_admin reach (FR-9.5).

Verifies migration 9f8e7d6c5b4a: the referrer sees their own code + rows, a
dual-line client sees them regardless of which line's client_profile_uuid the
JWT happens to carry (the gap documented at d6e7f8a9b0c1:33-43 — this table
deliberately keys on app.auth_user_uuid instead), the REFERRED person cannot
see the row that names them, admin sees everything, and every other role
(including sub_admin) sees nothing. Mirrors test_referral_bonus_config_rls.py's
harness.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.scripts.seed_helpers import dev_indian_mobile
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


async def _existing_code(auth_user_uuid: str) -> str:
    """register_set_password already issues a code for every self-registered
    client (services.referrals.issue_code_on_session) — fetch it rather than
    inserting a second row, which would collide on the auth_user_uuid PK."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT code FROM referral_codes WHERE auth_user_uuid = :uid"),
                {"uid": auth_user_uuid},
            )
        ).fetchone()
        assert row is not None, f"no referral_codes row for {auth_user_uuid}"
        return row[0]


async def _seed_referral(referrer_uuid: str, referred_uuid: str) -> str:
    import app.db.session as _session_mod
    from app.models.referral import Referral

    async with _session_mod.AsyncSessionLocal() as db:
        row = Referral(
            referrer_auth_user_uuid=uuid.UUID(referrer_uuid),
            referred_mobile=dev_indian_mobile(),
            referred_auth_user_uuid=uuid.UUID(referred_uuid),
        )
        db.add(row)
        await db.commit()
        return str(row.id)


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


async def _set_context(conn, auth_user_uuid: str, role: str, ps: str) -> None:
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
        {"uuid": auth_user_uuid, "role": role, "ps": ps},
    )


_ID_COLUMN = {"referrals": "id", "referral_codes": "auth_user_uuid"}


async def _select_as(
    table: str, *, auth_user_uuid: str, role: str, platform_scope: str = "false"
) -> list:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, auth_user_uuid, role, platform_scope)
            result = await conn.execute(text(f"SELECT {_ID_COLUMN[table]} AS id FROM {table}"))
            return [row[0] for row in result.fetchall()]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_referrer_sees_own_code_not_others(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    await _existing_code(uid_a)

    _, mobile_b = await full_registration(client, lines=["loans"])
    uid_b = await _auth_user_uuid(mobile_b)

    rows = await _select_as("referral_codes", auth_user_uuid=uid_a, role="client")
    assert uuid.UUID(uid_a) in rows

    rows_b = await _select_as("referral_codes", auth_user_uuid=uid_b, role="client")
    assert uuid.UUID(uid_a) not in rows_b


@pytest.mark.asyncio
async def test_referrer_sees_own_referrals_not_others(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    _, mobile_b = await full_registration(client, lines=["loans"])
    uid_b = await _auth_user_uuid(mobile_b)
    ref_id = await _seed_referral(uid_a, uid_b)

    rows = await _select_as("referrals", auth_user_uuid=uid_a, role="client")
    assert uuid.UUID(ref_id) in rows


@pytest.mark.asyncio
async def test_referred_person_cannot_see_the_row_naming_them(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    _, mobile_b = await full_registration(client, lines=["loans"])
    uid_b = await _auth_user_uuid(mobile_b)
    ref_id = await _seed_referral(uid_a, uid_b)

    rows = await _select_as("referrals", auth_user_uuid=uid_b, role="client")
    assert uuid.UUID(ref_id) not in rows


@pytest.mark.asyncio
async def test_dual_line_client_still_sees_own_rows(client: AsyncClient) -> None:
    """Identity-keyed, not client_profile_uuid: a dual-line client's JWT only
    ever carries ONE line's client_profile_uuid claim (loans-first,
    alphabetical), but referral_codes/referrals key on app.auth_user_uuid, so
    visibility does not depend on which line is "active"."""
    _, mobile_a = await full_registration(client, lines=["loans", "real_estate"])
    uid_a = await _auth_user_uuid(mobile_a)
    code = await _existing_code(uid_a)
    assert code

    rows = await _select_as("referral_codes", auth_user_uuid=uid_a, role="client")
    assert uuid.UUID(uid_a) in rows


@pytest.mark.asyncio
async def test_admin_sees_every_code_and_referral(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    await _existing_code(uid_a)
    _, mobile_b = await full_registration(client, lines=["loans"])
    uid_b = await _auth_user_uuid(mobile_b)
    ref_id = await _seed_referral(uid_a, uid_b)

    codes = await _select_as(
        "referral_codes", auth_user_uuid=str(uuid.uuid4()), role="admin", platform_scope="true"
    )
    assert uuid.UUID(uid_a) in codes

    referrals = await _select_as(
        "referrals", auth_user_uuid=str(uuid.uuid4()), role="admin", platform_scope="true"
    )
    assert uuid.UUID(ref_id) in referrals


@pytest.mark.asyncio
async def test_sub_admin_sees_nothing(client: AsyncClient) -> None:
    """FR-9.5: Sub Admin manages referral-bonus RULES only, never referral
    activity — no branch in either policy grants sub_admin a platform_scope
    bypass, unlike referral_bonus_config."""
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    await _existing_code(uid_a)
    _, mobile_b = await full_registration(client, lines=["loans"])
    uid_b = await _auth_user_uuid(mobile_b)
    await _seed_referral(uid_a, uid_b)

    codes = await _select_as(
        "referral_codes", auth_user_uuid=str(uuid.uuid4()), role="sub_admin", platform_scope="true"
    )
    assert codes == []
    referrals = await _select_as(
        "referrals", auth_user_uuid=str(uuid.uuid4()), role="sub_admin", platform_scope="true"
    )
    assert referrals == []


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["telecaller", "employee", "agent"])
async def test_staff_and_agent_roles_see_nothing(client: AsyncClient, role: str) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    await _existing_code(uid_a)

    rows = await _select_as(
        "referral_codes", auth_user_uuid=str(uuid.uuid4()), role=role, platform_scope="false"
    )
    assert rows == []


@pytest.mark.asyncio
async def test_api_user_has_no_write_grant(client: AsyncClient) -> None:
    """D16: all writes go through the bypass session — api_user must never
    hold INSERT/UPDATE/DELETE on either table, so an app-layer bug cannot
    corrupt this money-adjacent state under a normal request session."""
    engine = _engine()
    try:
        async with engine.begin() as conn:
            for table in ("referral_codes", "referrals"):
                result = await conn.execute(
                    text(
                        "SELECT privilege_type FROM information_schema.role_table_grants "
                        "WHERE table_name = :t AND grantee = 'api_user'"
                    ),
                    {"t": table},
                )
                privileges = {row[0] for row in result.fetchall()}
                assert privileges == {"SELECT"}, f"{table}: {privileges}"
    finally:
        await engine.dispose()
