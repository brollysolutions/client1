"""property_submissions RLS — submitter-owner isolation + Admin reviewer branch.

Verifies migration f4a5b6c7d8e9: an owning submitter sees only their own submission,
platform Admin sees the review queue, and Sub Admin cannot review another owner's
submission. Also checks that the owner branch supports real-estate Clients, Agents,
and Sub Admins without broadening approval authority.

Requires the Docker stack with migrations applied; auto-skips without Redis.
Mirrors test_enquiries_rls.py's harness.
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


async def _seed_submission(submitter_uuid: str) -> str:
    """Insert a pending submission via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.property_submission import PropertySubmission

    async with _session_mod.AsyncSessionLocal() as db:
        sub = PropertySubmission(
            submitter_uuid=uuid.UUID(submitter_uuid),
            business_line="real_estate",
            title="3BHK Villa",
            type="Villa",
            location="Whitefield, Bengaluru",
            category="villas",
            city="Bengaluru",
            locality="Whitefield",
            pincode="560066",
            price_paise=95_00_00_000,
            furnishing="semi",
            construction_status="ready",
            rera_number="RERA/RE/2026/00042",
        )
        db.add(sub)
        await db.commit()
        return str(sub.id)


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
            result = await conn.execute(text("SELECT id FROM property_submissions"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_owner_agent_sees_own(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    sub_id = await _seed_submission(uid)

    rows = await _select_as(auth_user_uuid=uid, role="agent", business_line="real_estate")
    assert [r["id"] for r in rows] == [uuid.UUID(sub_id)]


@pytest.mark.asyncio
async def test_owner_client_sees_own(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    sub_id = await _seed_submission(uid)

    rows = await _select_as(auth_user_uuid=uid, role="client", business_line="both")
    assert [r["id"] for r in rows] == [uuid.UUID(sub_id)]


@pytest.mark.asyncio
async def test_other_agent_cannot_see_it(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    await _seed_submission(owner_uid)

    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid, role="agent", business_line="real_estate")
    assert rows == []


@pytest.mark.asyncio
async def test_platform_reviewer_sees_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    sub_id = await _seed_submission(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(sub_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_platform_sub_admin_cannot_see_shared_queue(client: AsyncClient) -> None:
    """Platform scope does not turn Sub Admin into an approval reviewer."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    sub_id = await _seed_submission(uid)

    rows = await _select_as(role="sub_admin", business_line="", platform_scope="true")
    assert uuid.UUID(sub_id) not in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_re_sub_admin_cannot_see_another_submitters_row(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    sub_id = await _seed_submission(uid)

    rows = await _select_as(role="sub_admin", business_line="real_estate", platform_scope="false")
    assert uuid.UUID(sub_id) not in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_re_telecaller_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    await _seed_submission(uid)

    rows = await _select_as(role="telecaller", business_line="real_estate")
    assert rows == []


@pytest.mark.asyncio
async def test_plain_client_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    await _seed_submission(uid)

    # A different client, no ownership, no reviewer role.
    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other_uid = await _auth_user_uuid(other_mobile)
    rows = await _select_as(auth_user_uuid=other_uid, role="client")
    assert rows == []


@pytest.mark.asyncio
async def test_insert_check_rejects_foreign_submitter(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', 'agent', true),"
                    "set_config('app.business_line', 'real_estate', true),"
                    "set_config('app.platform_scope', 'false', true)"
                ),
                {"uuid": uid},
            )
            with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                await conn.execute(
                    text(
                        "INSERT INTO property_submissions "
                        "(id, submitter_uuid, business_line, status, title, type, location, "
                        "category, city, locality, pincode, price_paise, furnishing, "
                        "construction_status, rera_number) VALUES "
                        "(gen_random_uuid(), gen_random_uuid(), 'real_estate', 'pending', 't', "
                        "'Villa', 'l', 'villas', 'c', 'loc', '560001', 100, 'semi', 'ready', 'R1')"
                    )
                )
    finally:
        await engine.dispose()
