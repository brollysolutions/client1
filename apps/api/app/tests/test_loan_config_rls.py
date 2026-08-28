"""loan_types / banks / bank_loan_type_availability RLS — migration 678f7a77e812.

Two things this file exists to pin down:

1. bank_loan_type_availability's SELECT policy is `USING (true)` — readable by
   EVERY role, not just Admin. This is the inverse of every other RLS test in
   this codebase, and it is load-bearing: services.loan_applications reads
   this table to decide whether a bank may be assigned to a progressing
   application, and a missing row means available. If this policy were ever
   narrowed to Admin-only, a non-admin session would read zero rows, "no
   rows" is indistinguishable from "no override exists", and the server-side
   enforcement check would silently become a permanent no-op that every
   admin-run test would still pass. test_availability_select_visible_to_every_role
   below is the guard against that regression.

2. loan_types/banks have NO DELETE grant and NO writable `name` column
   (loan_types) — enforced at the privilege layer, the same posture as
   audit_log/loan_txn_history/offers. A privilege violation raises
   `InsufficientPrivilegeError` from asyncpg, not a "0 rows" RLS-style
   silence, so these are asserted with `pytest.raises`, mirroring
   test_offers_rls.py's WITH CHECK negative tests.

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


async def _set_ctx(conn, **ctx) -> None:
    await conn.execute(text("SET LOCAL ROLE api_user"))
    defaults = {
        "auth_user_uuid": str(uuid.uuid4()),
        "role": "client",
        "business_line": "",
        "client_profile_uuid": "",
        "agent_profile_uuid": "",
        "staff_profile_uuid": "",
        "platform_scope": "false",
    }
    defaults.update(ctx)
    await conn.execute(
        text(
            "SELECT "
            "set_config('app.auth_user_uuid', :auth_user_uuid, true),"
            "set_config('app.role', :role, true),"
            "set_config('app.business_line', :business_line, true),"
            "set_config('app.client_profile_uuid', :client_profile_uuid, true),"
            "set_config('app.agent_profile_uuid', :agent_profile_uuid, true),"
            "set_config('app.staff_profile_uuid', :staff_profile_uuid, true),"
            "set_config('app.platform_scope', :platform_scope, true)"
        ),
        defaults,
    )


async def _seed_bank_and_loan_type() -> tuple[str, str]:
    """Insert via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.loan import Bank, LoanType

    async with _session_mod.AsyncSessionLocal() as db:
        bank = Bank(name=f"RLS Test Bank {uuid.uuid4().hex[:8]}")
        loan_type = LoanType(name=f"rls-lt-{uuid.uuid4().hex[:8]}", label="RLS Test Loan Type")
        db.add_all([bank, loan_type])
        await db.commit()
        return str(bank.id), str(loan_type.id)


ADMIN_CTX = {"role": "admin", "platform_scope": "true"}


# ---------------------------------------------------------------------------
# 1. availability SELECT — visible to every role (the load-bearing check)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_availability_select_visible_to_every_role(client: AsyncClient) -> None:
    bank_id, loan_type_id = await _seed_bank_and_loan_type()

    import app.db.session as _session_mod
    from app.models.loan import BankLoanTypeAvailability

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            BankLoanTypeAvailability(
                bank_id=uuid.UUID(bank_id), loan_type_id=uuid.UUID(loan_type_id), available=False
            )
        )
        await db.commit()

    engine = _engine()
    try:
        for ctx in (
            {"role": "client"},
            {"role": "telecaller", "business_line": "loans"},
            {"role": "employee", "business_line": "loans"},
            {"role": "agent", "business_line": "loans"},
            {"role": "sub_admin", "business_line": "both", "platform_scope": "true"},
            {"role": "admin", "platform_scope": "true"},
        ):
            async with engine.begin() as conn:
                await _set_ctx(conn, **ctx)
                result = await conn.execute(
                    text(
                        "SELECT available FROM bank_loan_type_availability "
                        "WHERE bank_id = :b AND loan_type_id = :lt"
                    ),
                    {"b": bank_id, "lt": loan_type_id},
                )
                rows = result.fetchall()
                assert rows != [], (
                    f"role={ctx.get('role')} could not see the row — "
                    "SELECT policy regressed to Admin-only"
                )
                assert rows[0][0] is False
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# 2. availability writes — admin only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_availability_insert_rejected_for_non_admin(client: AsyncClient) -> None:
    bank_id, loan_type_id = await _seed_bank_and_loan_type()

    engine = _engine()
    try:
        for ctx in (
            {"role": "telecaller", "business_line": "loans"},
            {"role": "sub_admin", "business_line": "both", "platform_scope": "true"},
            {"role": "client"},
        ):
            async with engine.begin() as conn:
                await _set_ctx(conn, **ctx)
                with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                    await conn.execute(
                        text(
                            "INSERT INTO bank_loan_type_availability "
                            "(bank_id, loan_type_id, available) VALUES (:b, :lt, false)"
                        ),
                        {"b": bank_id, "lt": loan_type_id},
                    )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_availability_insert_and_update_succeed_for_admin(client: AsyncClient) -> None:
    bank_id, loan_type_id = await _seed_bank_and_loan_type()

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, **ADMIN_CTX)
            await conn.execute(
                text(
                    "INSERT INTO bank_loan_type_availability "
                    "(bank_id, loan_type_id, available) VALUES (:b, :lt, false)"
                ),
                {"b": bank_id, "lt": loan_type_id},
            )
            await conn.execute(
                text(
                    "UPDATE bank_loan_type_availability SET available = true "
                    "WHERE bank_id = :b AND loan_type_id = :lt"
                ),
                {"b": bank_id, "lt": loan_type_id},
            )
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# 3. loan_types / banks writes — admin only, and only via the column grant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loan_type_insert_rejected_for_non_admin(client: AsyncClient) -> None:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, role="sub_admin", business_line="both", platform_scope="true")
            with pytest.raises(Exception):  # noqa: B017
                await conn.execute(
                    text(
                        "INSERT INTO loan_types (id, name, label, active) "
                        "VALUES (gen_random_uuid(), :n, 'Sneaky', true)"
                    ),
                    {"n": f"sneaky-{uuid.uuid4().hex[:8]}"},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_loan_type_update_active_rejected_for_sub_admin(client: AsyncClient) -> None:
    """A USING-policy mismatch doesn't raise — Postgres just excludes the row
    from the UPDATE, so the assertion is on rowcount, not an exception (unlike
    a WITH CHECK violation, which does raise)."""
    _, loan_type_id = await _seed_bank_and_loan_type()

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, role="sub_admin", business_line="both", platform_scope="true")
            result = await conn.execute(
                text("UPDATE loan_types SET active = false WHERE id = :id"),
                {"id": loan_type_id},
            )
            assert result.rowcount == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_loan_type_insert_and_update_succeed_for_admin(client: AsyncClient) -> None:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, **ADMIN_CTX)
            new_id = str(uuid.uuid4())
            await conn.execute(
                text(
                    "INSERT INTO loan_types (id, name, label, active) "
                    "VALUES (:id, :n, 'Admin Created', true)"
                ),
                {"id": new_id, "n": f"admin-created-{uuid.uuid4().hex[:8]}"},
            )
            await conn.execute(
                text("UPDATE loan_types SET label = 'Renamed', active = false WHERE id = :id"),
                {"id": new_id},
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_loan_type_name_column_not_grantable_even_for_admin(client: AsyncClient) -> None:
    """The column-scoped GRANT UPDATE (label, active, updated_at) deliberately
    excludes `name` — the slug is the stable machine id. This is a privilege
    error, not an RLS denial, so it fires even under a full-admin context."""
    _, loan_type_id = await _seed_bank_and_loan_type()

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, **ADMIN_CTX)
            with pytest.raises(Exception):  # noqa: B017 — asyncpg insufficient-privilege
                await conn.execute(
                    text("UPDATE loan_types SET name = 'renamed-slug' WHERE id = :id"),
                    {"id": loan_type_id},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_loan_type_rejected_even_for_admin(client: AsyncClient) -> None:
    """No DELETE grant exists on loan_types for any role — pins the no-DELETE
    decision at the privilege layer, not just the missing router path."""
    _, loan_type_id = await _seed_bank_and_loan_type()

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, **ADMIN_CTX)
            with pytest.raises(Exception):  # noqa: B017
                await conn.execute(
                    text("DELETE FROM loan_types WHERE id = :id"), {"id": loan_type_id}
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_bank_succeeds_for_admin(client: AsyncClient) -> None:
    bank_id, _ = await _seed_bank_and_loan_type()

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, **ADMIN_CTX)
            result = await conn.execute(text("DELETE FROM banks WHERE id = :id"), {"id": bank_id})
            assert result.rowcount == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_bank_rejected_for_sub_admin(client: AsyncClient) -> None:
    bank_id, _ = await _seed_bank_and_loan_type()

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, role="sub_admin", business_line="both", platform_scope="true")
            result = await conn.execute(text("DELETE FROM banks WHERE id = :id"), {"id": bank_id})
            assert result.rowcount == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_bank_insert_and_update_succeed_for_admin(client: AsyncClient) -> None:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, **ADMIN_CTX)
            new_id = str(uuid.uuid4())
            await conn.execute(
                text("INSERT INTO banks (id, name, active) VALUES (:id, :n, true)"),
                {"id": new_id, "n": f"Admin Created Bank {uuid.uuid4().hex[:8]}"},
            )
            await conn.execute(
                text("UPDATE banks SET active = false WHERE id = :id"), {"id": new_id}
            )
    finally:
        await engine.dispose()
