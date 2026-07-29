"""GET /api/v1/agent/earnings — agent's own read-only commission ledger +
totals (Agent_Dashboard_System_Design.md §5.2, the /earnings screen).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus, LoanType
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus
from app.models.user import User
from conftest import full_registration, unique_mobile

pytestmark = pytest.mark.asyncio


def _admin_token(user_id: str) -> str:
    return create_access_token(
        {"sub": user_id, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _agent_token(user_id: str, agent_profile_uuid: str, business_line: str) -> str:
    return create_access_token(
        {
            "sub": user_id,
            "role": "agent",
            "business_line": business_line,
            "agent_profile_uuid": agent_profile_uuid,
            "platform_scope": "line",
        }
    )


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _seed_agent(business_line: str = "loans") -> tuple[str, str]:
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


async def _seed_deal(agent_profile_uuid: str, business_line: str = "loans") -> str:
    """Returns a disbursed loan_application id with the given origin agent."""
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
        return str(loan.id)


async def test_earnings_totals_and_rows_scope_to_own_agent(client: AsyncClient) -> None:
    admin_token, _ = await _seed_admin_and_token(client)
    agent_a_uid, agent_a_profile = await _seed_agent("loans")
    agent_b_uid, agent_b_profile = await _seed_agent("loans")

    loan_a = await _seed_deal(agent_a_profile)
    loan_b = await _seed_deal(agent_b_profile)

    create_a = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_a, "agreed_amount_paise": 40_000},
    )
    assert create_a.status_code == 201, create_a.text
    create_b = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_b, "agreed_amount_paise": 90_000},
    )
    assert create_b.status_code == 201, create_b.text

    agent_a_token = _agent_token(agent_a_uid, agent_a_profile, "loans")
    res = await client.get("/api/v1/agent/earnings", headers=_headers(agent_a_token))
    assert res.status_code == 200, res.text
    body = res.json()

    row_ids = {r["deal_uuid"] for r in body["rows"]}
    assert loan_a in row_ids
    assert loan_b not in row_ids
    assert body["totals"]["pending_amount_paise"] == 40_000
    assert body["totals"]["paid_amount_paise"] == 0
    assert body["totals"]["total_amount_paise"] == 40_000


async def test_earnings_totals_split_pending_vs_paid(client: AsyncClient) -> None:
    admin_token, _ = await _seed_admin_and_token(client)
    agent_uid, agent_profile = await _seed_agent("loans")
    loan_1 = await _seed_deal(agent_profile)
    loan_2 = await _seed_deal(agent_profile)

    create_1 = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_1, "agreed_amount_paise": 30_000},
    )
    commission_1_id = create_1.json()["id"]
    await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_2, "agreed_amount_paise": 20_000},
    )

    # No payout endpoint yet (PR 2) — flip directly to simulate a settled commission.
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE commissions SET status = 'paid' WHERE id = :id"),
            {"id": commission_1_id},
        )
        await db.commit()

    agent_token = _agent_token(agent_uid, agent_profile, "loans")
    res = await client.get("/api/v1/agent/earnings", headers=_headers(agent_token))
    body = res.json()
    assert body["totals"]["paid_amount_paise"] == 30_000
    assert body["totals"]["pending_amount_paise"] == 20_000
    assert body["totals"]["total_amount_paise"] == 50_000


async def test_earnings_empty_for_agent_with_no_commissions(client: AsyncClient) -> None:
    agent_uid, agent_profile = await _seed_agent("loans")
    agent_token = _agent_token(agent_uid, agent_profile, "loans")
    res = await client.get("/api/v1/agent/earnings", headers=_headers(agent_token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["rows"] == []
    assert body["totals"]["total_amount_paise"] == 0


async def _seed_admin_and_token(client: AsyncClient) -> tuple[str, str]:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _admin_token(uid), uid
