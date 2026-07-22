"""transactions RLS — identity-level owner isolation, NO staff branch.

Verifies migration 7a8b9c1d2e3f's owner-only policy: a client sees only their
own transaction, another client sees none, non-owner staff/agent see none
(account-level, no business_line branch), an agent who OWNS a commission-type
row sees it (confirming ownership is the account identity, not a client-only
concept), and platform_scope (Admin/Sub Admin) sees all. Mirrors
test_bookmarks_rls.py's harness (the owner-only shape).

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


async def _seed_transaction(user_uuid: str, *, txn_type: str = "referral_bonus") -> str:
    """Insert a transaction via the app superuser (bypasses RLS) — the same
    mechanism a future money-layer producer would use."""
    import app.db.session as _session_mod
    from app.models.transaction import Transaction, TransactionStatus, TransactionType

    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=uuid.UUID(user_uuid),
            business_line=None,
            type=TransactionType(txn_type),
            status=TransactionStatus.PAID,
            amount_paise=100_000,
            currency="INR",
            description="Test payout",
        )
        db.add(txn)
        await db.commit()
        return str(txn.id)


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
            result = await conn.execute(text("SELECT id FROM transactions"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_client_sees_own_transaction(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    txn_id = await _seed_transaction(uid)

    rows = await _select_as(auth_user_uuid=uid)
    assert [r["id"] for r in rows] == [uuid.UUID(txn_id)]


@pytest.mark.asyncio
async def test_other_client_cannot_see_it(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    await _seed_transaction(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid)
    assert rows == []


@pytest.mark.asyncio
async def test_non_owner_staff_cannot_see_it(client: AsyncClient) -> None:
    """Account-level, no staff/business_line branch — unlike site_visits."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_transaction(uid)

    rows = await _select_as(role="telecaller", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_agent_sees_own_commission_row(client: AsyncClient) -> None:
    """Ownership is the account identity, not a client-only concept: an
    agent's own commission payout is visible under their own auth_user_uuid."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    txn_id = await _seed_transaction(uid, txn_type="commission")

    rows = await _select_as(auth_user_uuid=uid, role="agent", business_line="real_estate")
    assert uuid.UUID(txn_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    txn_id = await _seed_transaction(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(txn_id) in [r["id"] for r in rows]
