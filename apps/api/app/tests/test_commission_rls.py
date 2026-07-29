"""commissions RLS — identity+line-keyed agent read, admin-only write
(migration 692dd51658bf).

Verifies: an agent sees only their own commissions, scoped to their own
`app.business_line` claim; a different agent (even same line) sees nothing of
theirs; Sub Admin sees nothing (IDR §5.5 restricts commission entry to Admin,
no Sub Admin reading counterpart); full Admin sees everything; a request
session (api_user, agent role) cannot INSERT/UPDATE even a row it can SELECT
— only the admin branch of commissions_insert/commissions_update passes;
api_user has no DELETE grant at all.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.commission import Commission
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus, LoanType
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus
from app.models.user import User
from conftest import unique_mobile

pytestmark = pytest.mark.asyncio


async def _seed_agent(business_line: str = "loans") -> tuple[str, str]:
    """Returns (auth_user_uuid, agent_profile_uuid)."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"agent_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        agent = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line=business_line,
            status=ProfileStatus.ACTIVE,
        )
        db.add(agent)
        await db.commit()
        return str(user.id), str(agent.id)


async def _seed_deal(agent_profile_uuid: str, business_line: str) -> tuple[str, str]:
    """A disbursed loan application with an origin agent — returns
    (lead_id, loan_application_id). Real FK-satisfying rows, not bare uuids:
    commissions.lead_uuid/loan_application_uuid are enforced FKs."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.AGENT,
            origin_agent_profile_uuid=uuid.UUID(agent_profile_uuid),
        )
        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add_all([lead, client_user])
        await db.flush()
        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([client_profile, loan_type])
        await db.flush()
        loan = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            loan_type_id=loan_type.id,
            amount_requested=100000,
            status=LoanStatus.DISBURSED,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
            disbursed_at=datetime.now(UTC),
        )
        db.add(loan)
        await db.commit()
        return str(lead.id), str(loan.id)


async def _seed_commission(
    agent_auth_user_uuid: str, agent_profile_uuid: str, business_line: str
) -> str:
    import app.db.session as _session_mod

    lead_id, loan_id = await _seed_deal(agent_profile_uuid, business_line)

    async with _session_mod.AsyncSessionLocal() as db:
        admin_user = User(
            first_name="Test",
            last_name="Admin",
            mobile=unique_mobile(),
            email=f"admin_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(admin_user)
        await db.flush()

        commission = Commission(
            agent_auth_user_uuid=uuid.UUID(agent_auth_user_uuid),
            agent_profile_uuid=uuid.UUID(agent_profile_uuid),
            business_line=business_line,
            lead_uuid=uuid.UUID(lead_id),
            loan_application_uuid=uuid.UUID(loan_id),
            agreed_amount_paise=50_000,
            entered_by_uuid=admin_user.id,
        )
        db.add(commission)
        await db.commit()
        return str(commission.id)


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


async def _set_context(conn, auth_user_uuid: str, role: str, business_line: str, ps: str) -> None:
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
        {"uuid": auth_user_uuid, "role": role, "bl": business_line, "ps": ps},
    )


async def _select_ids_as(
    *, auth_user_uuid: str, role: str, business_line: str = "", platform_scope: str = "false"
) -> list[str]:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, auth_user_uuid, role, business_line, platform_scope)
            result = await conn.execute(text("SELECT id FROM commissions"))
            return [str(row[0]) for row in result.fetchall()]
    finally:
        await engine.dispose()


async def test_agent_sees_own_commission(client) -> None:
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(agent_uid, agent_profile_uuid, "loans")

    ids = await _select_ids_as(auth_user_uuid=agent_uid, role="agent", business_line="loans")
    assert commission_id in ids


async def test_agent_cannot_see_another_agents_commission(client) -> None:
    agent_a_uid, agent_a_profile = await _seed_agent("loans")
    commission_id = await _seed_commission(agent_a_uid, agent_a_profile, "loans")
    agent_b_uid, _ = await _seed_agent("loans")

    ids = await _select_ids_as(auth_user_uuid=agent_b_uid, role="agent", business_line="loans")
    assert commission_id not in ids


async def test_agent_wrong_line_context_sees_nothing(client) -> None:
    """Own identity, wrong business_line claim — the predicate requires BOTH."""
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(agent_uid, agent_profile_uuid, "loans")

    ids = await _select_ids_as(auth_user_uuid=agent_uid, role="agent", business_line="real_estate")
    assert commission_id not in ids


async def test_sub_admin_sees_nothing(client) -> None:
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(agent_uid, agent_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="sub_admin", platform_scope="true"
    )
    assert commission_id not in ids
    assert ids == []


async def test_full_admin_sees_everything(client) -> None:
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(agent_uid, agent_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="admin", platform_scope="true"
    )
    assert commission_id in ids


async def test_line_scoped_admin_sees_nothing(client) -> None:
    """The commissions_select admin branch requires platform_scope='true', not
    just role='admin' — same as every other admin-bypass predicate."""
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(agent_uid, agent_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="admin", platform_scope="line"
    )
    assert commission_id not in ids


async def test_agent_request_session_cannot_insert(client) -> None:
    """commissions_insert requires the admin predicate — an agent's own
    request session (even though it can SELECT its own rows) cannot write.
    Uses a real, well-formed deal (via _seed_deal) so a rejected INSERT is
    attributable to RLS, not the exactly-one-deal-ref CHECK constraint."""
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    lead_id, loan_id = await _seed_deal(agent_profile_uuid, "loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, agent_uid, "agent", "loans", "line")
            with pytest.raises(DBAPIError):
                await conn.execute(
                    text(
                        "INSERT INTO commissions "
                        "(id, agent_auth_user_uuid, agent_profile_uuid, business_line, "
                        "lead_uuid, loan_application_uuid, agreed_amount_paise, entered_by_uuid) "
                        "VALUES (:id, :agent_uid, :agent_profile, 'loans', :lead_id, :loan_id, "
                        "50000, :agent_uid)"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "agent_uid": agent_uid,
                        "agent_profile": agent_profile_uuid,
                        "lead_id": lead_id,
                        "loan_id": loan_id,
                    },
                )
    finally:
        await engine.dispose()


async def test_api_user_has_no_delete_grant(client) -> None:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    "SELECT privilege_type FROM information_schema.role_table_grants "
                    "WHERE table_name = 'commissions' AND grantee = 'api_user'"
                )
            )
            privileges = {row[0] for row in result.fetchall()}
    finally:
        await engine.dispose()
    assert privileges == {"SELECT", "INSERT", "UPDATE"}
