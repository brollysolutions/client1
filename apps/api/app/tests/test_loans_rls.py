"""loan_applications RLS — row isolation between clients, lines, and staff.

Mirrors test_leads_rls.py's raw-asyncpg + SET LOCAL ROLE api_user pattern.
Verifies migration 2b3c4d5e6f7a's policy as narrowed by d5e6f7a8b9c0 (Loan
Lifecycle Progression slice): a client sees only their own row, a cross-line
telecaller sees nothing, a same-line telecaller sees ONLY applications whose
lead is assigned to them (mirrors leads_rls's e6c7b8f9a0d1 narrowing — an
unassigned lead's application is invisible to any telecaller), and
platform_scope (Admin/Sub Admin) bypasses both the line and assignment
predicates entirely.

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


async def _seed_loan_application(
    client_profile_uuid: str, assigned_telecaller_staff_uuid: str | None = None
) -> str:
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
            status=LeadStatus.ASSIGNED if assigned_telecaller_staff_uuid else LeadStatus.CONVERTED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=(
                uuid.UUID(assigned_telecaller_staff_uuid)
                if assigned_telecaller_staff_uuid
                else None
            ),
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


async def _seed_telecaller(business_line: str = "loans") -> str:
    """Create an auth_user + telecaller StaffProfile. Returns the staff_profile_uuid."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _select_as(
    *,
    role: str,
    client_profile_uuid: str = "",
    business_line: str = "",
    platform_scope: str = "false",
    staff_profile_uuid: str = "",
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
async def test_unassigned_same_line_telecaller_cannot_see_loans_row(client: AsyncClient) -> None:
    """Post-narrowing (d5e6f7a8b9c0): a same-line telecaller with no assignment
    to the application's lead sees nothing, mirroring leads_rls."""
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)
    other_staff_uuid = await _seed_telecaller("loans")

    rows = await _select_as(
        role="telecaller", business_line="loans", staff_profile_uuid=other_staff_uuid
    )
    assert uuid.UUID(app_id) not in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_assigned_telecaller_can_see_loans_row(client: AsyncClient) -> None:
    """The narrowed telecaller branch: an application is visible only when its
    lead is assigned to this specific telecaller (d5e6f7a8b9c0)."""
    staff_uuid = await _seed_telecaller("loans")
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu, assigned_telecaller_staff_uuid=staff_uuid)

    rows = await _select_as(role="telecaller", business_line="loans", staff_profile_uuid=staff_uuid)
    assert uuid.UUID(app_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all_lines(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(app_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_application_created_via_endpoint_is_still_rls_scoped(client: AsyncClient) -> None:
    """End-to-end sibling of the tests above: a row created through the new
    POST /applications write path (not directly seeded) obeys the exact same
    RLS as a seeded row — own client sees it, a cross-line telecaller does
    not, and a same-line telecaller sees it ONLY once assigned to its lead
    (post-narrowing, d5e6f7a8b9c0) — self-apply never auto-assigns a
    telecaller, so an unassigned same-line telecaller sees nothing either."""
    token, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    headers = {"Authorization": f"Bearer {token}"}

    loan_type_id = (await client.get("/api/v1/loans/loan-types", headers=headers)).json()[
        "loan_types"
    ][0]["id"]
    created = await client.post(
        "/api/v1/loans/applications",
        headers=headers,
        json={"loan_type_id": loan_type_id, "amount_requested": "500000"},
    )
    app_id = created.json()["id"]

    own_rows = await _select_as(role="client", client_profile_uuid=cpu, business_line="loans")
    assert uuid.UUID(app_id) in [r["id"] for r in own_rows]

    cross_line_rows = await _select_as(role="telecaller", business_line="real_estate")
    assert uuid.UUID(app_id) not in [r["id"] for r in cross_line_rows]

    unassigned_staff_uuid = await _seed_telecaller("loans")
    same_line_unassigned_rows = await _select_as(
        role="telecaller", business_line="loans", staff_profile_uuid=unassigned_staff_uuid
    )
    assert uuid.UUID(app_id) not in [r["id"] for r in same_line_unassigned_rows]
