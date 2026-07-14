"""Backfill job tests: every client must hold a ClientProfile per business line.

backfill_customer_codes must heal a client missing one line's profile, leave a
complete client untouched, never provision a non-client user, and be idempotent
(a second run is a no-op). Requires the Docker stack; auto-skips without Redis,
same pattern as test_scheduler_prune.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

import app.db.session as db_session
from app.jobs.backfill_customer_codes import backfill_customer_codes
from conftest import full_registration, unique_email, unique_mobile


async def _user_id(mobile: str) -> str:
    async with db_session.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _lines(user_id: str) -> list[str]:
    async with db_session.AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text(
                    "SELECT business_line FROM client_profiles "
                    "WHERE auth_user_uuid = :u ORDER BY business_line"
                ),
                {"u": user_id},
            )
        ).fetchall()
        return [r[0] for r in rows]


async def _code(user_id: str, line: str) -> str | None:
    async with db_session.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT customer_code FROM client_profiles "
                    "WHERE auth_user_uuid = :u AND business_line = :l"
                ),
                {"u": user_id, "l": line},
            )
        ).fetchone()
        return row[0] if row else None


async def _delete_line(user_id: str, line: str) -> None:
    async with db_session.AsyncSessionLocal() as db:
        await db.execute(
            text("DELETE FROM client_profiles WHERE auth_user_uuid = :u AND business_line = :l"),
            {"u": user_id, "l": line},
        )
        await db.commit()


@pytest.mark.asyncio
async def test_backfill_fills_missing_line(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, mobile=unique_mobile())
    user_id = await _user_id(mobile)
    assert await _lines(user_id) == ["loans", "real_estate"]

    await _delete_line(user_id, "real_estate")
    assert await _lines(user_id) == ["loans"]

    await backfill_customer_codes()

    assert await _lines(user_id) == ["loans", "real_estate"]
    code = await _code(user_id, "real_estate")
    assert code is not None and code.startswith("CL-RE"), code


@pytest.mark.asyncio
async def test_backfill_ignores_complete_client(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, mobile=unique_mobile())
    user_id = await _user_id(mobile)
    before = await _lines(user_id)
    loans_code = await _code(user_id, "loans")

    await backfill_customer_codes()

    # No duplicate rows, and the existing code was not regenerated.
    assert await _lines(user_id) == before
    assert await _code(user_id, "loans") == loans_code


@pytest.mark.asyncio
async def test_backfill_ignores_non_client_user(client: AsyncClient) -> None:
    # A user with no client profile (e.g. a staff/agent account) must never be
    # provisioned a client profile by the backfill.
    user_id = str(uuid.uuid4())
    async with db_session.AsyncSessionLocal() as db:
        await db.execute(
            text(
                "INSERT INTO auth_users "
                "(id, first_name, last_name, mobile, email, status, created_at, updated_at) "
                "VALUES (:id, 'Staff', 'User', :m, :e, 'active', now(), now())"
            ),
            {"id": user_id, "m": unique_mobile(), "e": unique_email()},
        )
        await db.commit()

    await backfill_customer_codes()

    assert await _lines(user_id) == []


@pytest.mark.asyncio
async def test_backfill_is_idempotent(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, mobile=unique_mobile())
    user_id = await _user_id(mobile)
    await _delete_line(user_id, "loans")

    await backfill_customer_codes()
    code_after_first = await _code(user_id, "loans")
    await backfill_customer_codes()  # second run must not error or change anything
    code_after_second = await _code(user_id, "loans")

    assert code_after_first is not None
    assert code_after_first == code_after_second  # not regenerated on the second run
    assert await _lines(user_id) == ["loans", "real_estate"]
