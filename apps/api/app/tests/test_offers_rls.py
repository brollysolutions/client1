"""offers RLS — shared sub_admin visibility + narrow positive allowlist.

Verifies migration b5c6d7e8f9a0: sub_admin sees EVERY offer (shared content-team
surface, not owner-scoped like property_submissions), admin sees every offer too
(read-only oversight), and every other role (telecaller/employee/agent/client)
sees NOTHING — denial by absence of a grant, not a filtered policy. Also checks
INSERT WITH CHECK (only sub_admin, only as a fresh draft) and that UPDATE is
rejected for a non-owner sub_admin (unlike banners, offers' UPDATE USING has no
status restriction — status-direction is app-layer, so ownership is the only
RLS-enforced axis here).

Requires the Docker stack with migrations applied; auto-skips without Redis.
Mirrors test_banners_rls.py's harness.
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


async def _seed_offer(created_by_uuid: str, status: str = "draft") -> str:
    """Insert an offer via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.offer import Offer

    async with _session_mod.AsyncSessionLocal() as db:
        offer = Offer(
            business_line="loans",
            title="Diwali Cashback Offer",
            discount_type="percentage",
            discount_value=10,
            status=status,
            created_by_uuid=uuid.UUID(created_by_uuid),
        )
        db.add(offer)
        await db.commit()
        return str(offer.id)


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
            result = await conn.execute(text("SELECT id FROM offers"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sub_admin_sees_every_offer_not_just_own(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    offer_id = await _seed_offer(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid, role="sub_admin", platform_scope="true")
    assert uuid.UUID(offer_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_admin_sees_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    offer_id = await _seed_offer(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(offer_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_telecaller_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_offer(uid)

    rows = await _select_as(role="telecaller", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_employee_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_offer(uid)

    rows = await _select_as(role="employee", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_agent_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_offer(uid)

    rows = await _select_as(role="agent", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_plain_client_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_offer(uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)
    rows = await _select_as(auth_user_uuid=other_uid, role="client")
    assert rows == []


@pytest.mark.asyncio
async def test_insert_check_rejects_non_draft_initial_status(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', 'sub_admin', true),"
                    "set_config('app.business_line', 'both', true),"
                    "set_config('app.platform_scope', 'true', true)"
                ),
                {"uuid": uid},
            )
            with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                await conn.execute(
                    text(
                        "INSERT INTO offers "
                        "(id, business_line, title, discount_type, discount_value, "
                        "status, created_by_uuid) VALUES "
                        "(gen_random_uuid(), 'loans', 'Sneaky active offer', 'percentage', 10, "
                        "'active', :uuid)"
                    ),
                    {"uuid": uid},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_insert_check_rejects_foreign_creator(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', 'sub_admin', true),"
                    "set_config('app.business_line', 'both', true),"
                    "set_config('app.platform_scope', 'true', true)"
                ),
                {"uuid": uid},
            )
            with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                await conn.execute(
                    text(
                        "INSERT INTO offers "
                        "(id, business_line, title, discount_type, discount_value, "
                        "status, created_by_uuid) VALUES "
                        "(gen_random_uuid(), 'loans', 'Spoofed owner', 'percentage', 10, "
                        "'draft', gen_random_uuid())"
                    )
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_update_rejected_for_non_owner(client: AsyncClient) -> None:
    """Offers' UPDATE USING has no status restriction (unlike banners) — the only
    RLS-enforced axis here is ownership; status-direction is app-layer only."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    offer_id = await _seed_offer(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', 'sub_admin', true),"
                    "set_config('app.business_line', 'both', true),"
                    "set_config('app.platform_scope', 'true', true)"
                ),
                {"uuid": other_uid},
            )
            result = await conn.execute(
                text("UPDATE offers SET title = 'Hijacked' WHERE id = :id"),
                {"id": offer_id},
            )
            # RLS USING clause excludes the row (not the owner) — zero-row no-op.
            assert result.rowcount == 0
    finally:
        await engine.dispose()
