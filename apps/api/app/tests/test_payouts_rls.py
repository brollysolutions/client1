"""payouts RLS — admin-only workflow isolation.

Verifies migration 9d2e3f4a5b6c's platform-scope-only policy: an Admin / Sub
Admin (platform_scope='true') sees every payout; the recipient client sees
NONE (the maker/checker/gateway machinery is never exposed to them); line staff
and agents see NONE. This is the opposite ownership model from transactions
(recipient-owned) — payouts belong to the admin workflow, not the payee.

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


async def _seed_payout(recipient_uuid: str, maker_uuid: str) -> str:
    """Insert a payout via the app superuser (bypasses RLS) — the same mechanism
    the payout service uses on its bypass session."""
    import app.db.session as _session_mod
    from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uuid),
            business_line=None,
            type=PayoutType.REFERRAL_BONUS,
            amount_paise=100_000,
            currency="INR",
            status=PayoutStatus.PENDING_APPROVAL,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(maker_uuid),
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


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
            result = await conn.execute(text("SELECT id FROM payouts"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_sees_all_payouts(client: AsyncClient) -> None:
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_uuid(recipient_mobile)
    maker_uid = await _auth_user_uuid(maker_mobile)
    payout_id = await _seed_payout(recipient_uid, maker_uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(payout_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_recipient_client_sees_no_payout(client: AsyncClient) -> None:
    """The payee must NOT see the payout workflow row — unlike transactions."""
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_uuid(recipient_mobile)
    maker_uid = await _auth_user_uuid(maker_mobile)
    await _seed_payout(recipient_uid, maker_uid)

    rows = await _select_as(auth_user_uuid=recipient_uid, role="client")
    assert rows == []


@pytest.mark.asyncio
async def test_line_staff_sees_no_payout(client: AsyncClient) -> None:
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_uuid(recipient_mobile)
    maker_uid = await _auth_user_uuid(maker_mobile)
    await _seed_payout(recipient_uid, maker_uid)

    # Line-scoped sub_admin (platform_scope='false') gets nothing.
    rows = await _select_as(role="sub_admin", business_line="loans", platform_scope="false")
    assert rows == []


@pytest.mark.asyncio
async def test_agent_sees_no_payout(client: AsyncClient) -> None:
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_uuid(recipient_mobile)
    maker_uid = await _auth_user_uuid(maker_mobile)
    await _seed_payout(recipient_uid, maker_uid)

    rows = await _select_as(auth_user_uuid=recipient_uid, role="agent", business_line="real_estate")
    assert rows == []
