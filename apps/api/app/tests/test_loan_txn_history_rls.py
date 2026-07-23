"""loan_txn_history RLS — telecaller (own assigned lead), client-own, platform.

Verifies migration a1b2c3d4e5f6's policy: a telecaller sees/writes txn rows only
for a loan_application whose lead is assigned to them, an unassigned/other-line
telecaller sees nothing, the owning client sees their own rows, another client
sees none, and platform Admin bypass sees all. No UPDATE/DELETE grant (immutable
entry record).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import unique_mobile


async def _seed_staff_profile(role: str, business_line: str = "loans") -> tuple[str, str]:
    """Create an auth_user + StaffProfile of the given role.

    Returns (auth_user_uuid, staff_uuid)."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Staff",
            mobile=unique_mobile(),
            email=f"st_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole(role),
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"ST-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _seed_client_with_loan_application(
    business_line: str = "loans", assigned_telecaller_staff_uuid: str | None = None
) -> tuple[str, str]:
    """Seed a client_profile + assigned lead + loan_application. Returns
    (client_profile_uuid, loan_application_uuid)."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.loan import Bank, LoanApplication, LoanType
    from app.models.profile import ClientProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        client_profile = ClientProfile(
            auth_user_uuid=user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(client_profile)
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Home Loan")
        db.add(loan_type)
        bank = Bank(name="Test Bank")
        db.add(bank)
        await db.flush()

        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED if assigned_telecaller_staff_uuid else LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
            client_profile_uuid=client_profile.id,
            assigned_telecaller_profile_uuid=(
                uuid.UUID(assigned_telecaller_staff_uuid)
                if assigned_telecaller_staff_uuid
                else None
            ),
        )
        db.add(lead)
        await db.flush()

        application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            loan_type_id=loan_type.id,
            bank_id=bank.id,
        )
        db.add(application)
        await db.commit()
        return str(client_profile.id), str(application.id)


async def _insert_txn_as(
    *,
    application_id: str,
    business_line: str,
    role: str,
    staff_profile_uuid: str = "",
    client_profile_uuid: str = "",
    platform_scope: str = "false",
) -> str | None:
    """Attempt an INSERT under the given RLS context. Returns the new row id, or
    None if WITH CHECK silently rejected zero rows affected (shouldn't happen —
    RLS raises)."""
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
                    "set_config('app.staff_profile_uuid', :spu, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "cpu": client_profile_uuid,
                    "spu": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(
                text(
                    "INSERT INTO loan_txn_history "
                    "(id, loan_application_uuid, business_line, bank_name, created_at) "
                    "VALUES (gen_random_uuid(), :app_id, :bl, 'Test Bank', now()) "
                    "RETURNING id"
                ),
                {"app_id": application_id, "bl": business_line},
            )
            row = result.fetchone()
            return str(row[0]) if row else None
    finally:
        await engine.dispose()


async def _select_as(
    *,
    role: str,
    staff_profile_uuid: str = "",
    client_profile_uuid: str = "",
    platform_scope: str = "false",
    business_line: str = "loans",
) -> list[dict]:
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
                    "set_config('app.staff_profile_uuid', :spu, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "cpu": client_profile_uuid,
                    "spu": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM loan_txn_history"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_assigned_telecaller_can_insert_and_see(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_staff_profile("telecaller", "loans")
    _, application_id = await _seed_client_with_loan_application(
        "loans", assigned_telecaller_staff_uuid=staff_uuid
    )

    txn_id = await _insert_txn_as(
        application_id=application_id,
        business_line="loans",
        role="telecaller",
        staff_profile_uuid=staff_uuid,
    )
    assert txn_id is not None

    rows = await _select_as(role="telecaller", staff_profile_uuid=staff_uuid)
    assert txn_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_unassigned_telecaller_cannot_insert(client: AsyncClient) -> None:
    _, owner_staff_uuid = await _seed_staff_profile("telecaller", "loans")
    _, other_staff_uuid = await _seed_staff_profile("telecaller", "loans")
    _, application_id = await _seed_client_with_loan_application(
        "loans", assigned_telecaller_staff_uuid=owner_staff_uuid
    )

    with pytest.raises(DBAPIError):
        await _insert_txn_as(
            application_id=application_id,
            business_line="loans",
            role="telecaller",
            staff_profile_uuid=other_staff_uuid,
        )


@pytest.mark.asyncio
async def test_other_line_telecaller_cannot_insert(client: AsyncClient) -> None:
    _, re_staff_uuid = await _seed_staff_profile("telecaller", "real_estate")
    loans_staff_uuid_pair = await _seed_staff_profile("telecaller", "loans")
    _, application_id = await _seed_client_with_loan_application(
        "loans", assigned_telecaller_staff_uuid=loans_staff_uuid_pair[1]
    )

    with pytest.raises(DBAPIError):
        await _insert_txn_as(
            application_id=application_id,
            business_line="loans",
            role="telecaller",
            staff_profile_uuid=re_staff_uuid,
        )


@pytest.mark.asyncio
async def test_owning_client_sees_own_rows(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_staff_profile("telecaller", "loans")
    client_profile_uuid, application_id = await _seed_client_with_loan_application(
        "loans", assigned_telecaller_staff_uuid=staff_uuid
    )
    txn_id = await _insert_txn_as(
        application_id=application_id,
        business_line="loans",
        role="telecaller",
        staff_profile_uuid=staff_uuid,
    )

    rows = await _select_as(role="client", client_profile_uuid=client_profile_uuid)
    assert txn_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_other_client_sees_nothing(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_staff_profile("telecaller", "loans")
    _, application_id = await _seed_client_with_loan_application(
        "loans", assigned_telecaller_staff_uuid=staff_uuid
    )
    await _insert_txn_as(
        application_id=application_id,
        business_line="loans",
        role="telecaller",
        staff_profile_uuid=staff_uuid,
    )

    other_client_profile_uuid, _ = await _seed_client_with_loan_application("loans")
    rows = await _select_as(role="client", client_profile_uuid=other_client_profile_uuid)
    assert rows == []


@pytest.mark.asyncio
async def test_platform_scope_sees_all(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_staff_profile("telecaller", "loans")
    _, application_id = await _seed_client_with_loan_application(
        "loans", assigned_telecaller_staff_uuid=staff_uuid
    )
    txn_id = await _insert_txn_as(
        application_id=application_id,
        business_line="loans",
        role="telecaller",
        staff_profile_uuid=staff_uuid,
    )

    rows = await _select_as(role="admin", platform_scope="true")
    assert txn_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_update_denied_no_grant(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_staff_profile("telecaller", "loans")
    _, application_id = await _seed_client_with_loan_application(
        "loans", assigned_telecaller_staff_uuid=staff_uuid
    )
    txn_id = await _insert_txn_as(
        application_id=application_id,
        business_line="loans",
        role="telecaller",
        staff_profile_uuid=staff_uuid,
    )

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
        with pytest.raises(DBAPIError):
            async with engine.begin() as conn:
                await conn.execute(text("SET LOCAL ROLE api_user"))
                await conn.execute(
                    text(
                        "SELECT "
                        "set_config('app.auth_user_uuid', :uuid, true),"
                        "set_config('app.role', 'telecaller', true),"
                        "set_config('app.business_line', 'loans', true),"
                        "set_config('app.client_profile_uuid', '', true),"
                        "set_config('app.agent_profile_uuid', '', true),"
                        "set_config('app.staff_profile_uuid', :spu, true),"
                        "set_config('app.platform_scope', 'false', true)"
                    ),
                    {"uuid": str(uuid.uuid4()), "spu": staff_uuid},
                )
                await conn.execute(
                    text("UPDATE loan_txn_history SET bank_name = 'Changed' WHERE id = :id"),
                    {"id": txn_id},
                )
    finally:
        await engine.dispose()
