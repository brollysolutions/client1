"""loan_applications RLS — row isolation between clients, lines, and staff.

Mirrors test_leads_rls.py's raw-asyncpg + SET LOCAL ROLE api_user pattern.
Verifies migration 2b3c4d5e6f7a's policy: a client sees only their own row, a
cross-line telecaller sees nothing, a same-line telecaller sees it, and
platform_scope (Admin/Sub Admin) bypasses the line predicate entirely.

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
from conftest import full_registration, unique_mobile


async def _client_profile_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT cp.id FROM client_profiles cp "
                    "JOIN auth_users u ON u.id = cp.auth_user_uuid "
                    "WHERE u.mobile = :m AND cp.business_line = 'loans'"
                ),
                {"m": mobile},
            )
        ).fetchone()
        assert row is not None, f"no loans client_profile for {mobile}"
        return str(row[0])


async def _seed_loan_application(client_profile_uuid: str) -> str:
    """Insert a lead + loan_application via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.loan import LoanApplication, LoanStatus

    async with _session_mod.AsyncSessionLocal() as db:
        loan_type = (await db.execute(text("SELECT id FROM loan_types LIMIT 1"))).fetchone()
        assert loan_type is not None, "loan_types seed missing — run migration 1a2b3c4d5e6f"

        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            status=LeadStatus.CONVERTED,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.flush()

        loan_application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            business_line="loans",
            loan_type_id=loan_type[0],
            status=LoanStatus.NEW,
        )
        db.add(loan_application)
        await db.commit()
        return str(loan_application.id)


async def _select_as(
    *,
    role: str,
    client_profile_uuid: str = "",
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
                    "set_config('app.client_profile_uuid', :cpu, true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', '', true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "cpu": client_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM loan_applications"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_client_sees_own_loan_application(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)

    rows = await _select_as(role="client", client_profile_uuid=cpu, business_line="loans")
    assert [r["id"] for r in rows] == [uuid.UUID(app_id)]


@pytest.mark.asyncio
async def test_other_client_cannot_see_it(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_cpu = await _client_profile_uuid(owner_mobile)
    await _seed_loan_application(owner_cpu)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_cpu = await _client_profile_uuid(other_mobile)

    rows = await _select_as(role="client", client_profile_uuid=other_cpu, business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_cross_line_telecaller_cannot_see_loans_row(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    await _seed_loan_application(cpu)

    rows = await _select_as(role="telecaller", business_line="real_estate")
    assert rows == []


@pytest.mark.asyncio
async def test_same_line_telecaller_can_see_loans_row(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)

    rows = await _select_as(role="telecaller", business_line="loans")
    # Broad visibility (all loans-line rows), not scoped to one client_profile_uuid
    # like the client-role test above — assert membership, not exact equality, since
    # other tests in this session may have seeded other loans-line applications.
    assert uuid.UUID(app_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all_lines(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(app_id) in [r["id"] for r in rows]
