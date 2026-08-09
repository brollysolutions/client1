"""Admin commission entry + oversight + cancel (FR-8.1/8.2, IDR v1.4 §5.5).

Covers the eligible-deal queue, the create-from-deal invariant (agent/line/
lead derived server-side, never from the request body), the partial-unique
double-entry guard, cancel + its payout-attached guard, and role gating
(line-scoped admin rejected — the same guard reporting.py and referrals.py
both need, since deps.require_admin is role-only).
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
from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus
from app.models.property import Property
from app.models.property_deal import PropertyDeal, PropertyDealStatus
from app.models.user import User
from conftest import full_registration, unique_mobile

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Seed helpers — bypass session, mirrors test_reporting_service.py's shape
# ---------------------------------------------------------------------------


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


def _admin_token(user_id: str, *, platform_scope: str = "true") -> str:
    return create_access_token(
        {"sub": user_id, "role": "admin", "business_line": "", "platform_scope": platform_scope}
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


async def _make_admin(client: AsyncClient) -> tuple[str, str]:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _admin_token(uid), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_agent(business_line: str = "loans") -> tuple[str, str, str]:
    """Returns (auth_user_uuid, agent_profile_uuid, agent_code)."""
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
        code = f"AG-{uuid.uuid4().hex[:8]}"
        agent = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=code,
            business_line=business_line,
            status=ProfileStatus.ACTIVE,
        )
        db.add(agent)
        await db.commit()
        return str(user.id), str(agent.id), code


async def _seed_lead(*, business_line: str, origin_agent_profile_uuid: str | None) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.AGENT if origin_agent_profile_uuid else LeadOrigin.DIRECT,
            origin_agent_profile_uuid=(
                uuid.UUID(origin_agent_profile_uuid) if origin_agent_profile_uuid else None
            ),
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_loan_application(
    *,
    lead_id: str,
    business_line: str = "loans",
    status: LoanStatus = LoanStatus.DISBURSED,
    disbursed_at: datetime | None = "unset",  # type: ignore[assignment]
) -> str:
    """`disbursed_at` defaults to "was disbursed at some point" whenever
    `status` is DISBURSED or CLOSED (CLOSED is only reachable from DISBURSED
    in the real state machine, so a directly-seeded CLOSED test row should
    carry the same event marker a real one would) — pass an explicit value
    (including None) to override, e.g. to seed a loan that reached a
    terminal status WITHOUT ever disbursing."""
    import app.db.session as _session_mod

    if disbursed_at == "unset":
        disbursed_at = (
            datetime.now(UTC) if status in (LoanStatus.DISBURSED, LoanStatus.CLOSED) else None
        )

    async with _session_mod.AsyncSessionLocal() as db:
        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
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
        application = LoanApplication(
            lead_uuid=uuid.UUID(lead_id),
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            loan_type_id=loan_type.id,
            amount_requested=100000,
            status=status,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
            disbursed_at=disbursed_at,
        )
        db.add(application)
        await db.commit()
        return str(application.id)


async def _seed_property_deal(
    *,
    lead_id: str,
    business_line: str = "real_estate",
    status: PropertyDealStatus = PropertyDealStatus.CLOSED,
) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
        await db.flush()
        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        prop = Property(
            business_line=business_line,
            active=True,
            title=f"Test Property {uuid.uuid4().hex[:8]}",
            type="Apartment",
            location="Test Locality, Test City",
            price_display="₹80 L",
            category="apartments",
            city="Test City",
            locality="Test Locality",
            pincode="560001",
            price_paise=8_000_000_0,
            bhk=2,
            area_sqft=1100,
            furnishing="furnished",
            construction_status="ready",
            amenities=[],
            age_years=1,
            rera_number=f"RERA/TEST/{uuid.uuid4().hex[:8]}",
            details={},
        )
        db.add_all([client_profile, prop])
        await db.flush()
        deal = PropertyDeal(
            lead_uuid=uuid.UUID(lead_id),
            client_profile_uuid=client_profile.id,
            property_id=prop.id,
            business_line=business_line,
            status=status,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
        )
        db.add(deal)
        await db.commit()
        return str(deal.id)


async def _get_commission_row(commission_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT status, agent_auth_user_uuid, business_line, payout_uuid "
                    "FROM commissions WHERE id = :id"
                ),
                {"id": commission_id},
            )
        ).fetchone()
        assert row is not None
        return {
            "status": row[0],
            "agent_auth_user_uuid": row[1],
            "business_line": row[2],
            "payout_uuid": row[3],
        }


# ---------------------------------------------------------------------------
# Eligible-deal queue
# ---------------------------------------------------------------------------


async def test_eligible_deals_includes_disbursed_loan_with_origin_agent(
    client: AsyncClient,
) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert loan_id in ids


async def test_eligible_deals_excludes_no_origin_agent(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=None)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert loan_id not in ids


async def test_eligible_deals_excludes_non_terminal_status(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id, status=LoanStatus.SANCTIONED)

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert loan_id not in ids


async def test_eligible_deals_excludes_deal_with_live_commission(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    assert create_res.status_code == 201, create_res.text

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert loan_id not in ids


async def test_property_deal_eligible_deals_excludes_deal_with_live_commission(
    client: AsyncClient,
) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("real_estate")
    lead_id = await _seed_lead(
        business_line="real_estate", origin_agent_profile_uuid=agent_profile_uuid
    )
    deal_id = await _seed_property_deal(lead_id=lead_id)

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "property_deal", "deal_uuid": deal_id, "agreed_amount_paise": 50_000},
    )
    assert create_res.status_code == 201, create_res.text

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert deal_id not in ids


async def test_loan_disbursed_then_closed_stays_eligible(client: AsyncClient) -> None:
    """Regression test (review finding, 2026-07-29): DISBURSED is not
    terminal — a loan normally moves on to CLOSED afterward. Eligibility
    must key off disbursed_at (an event marker set once, at the moment
    status first reaches DISBURSED), not live status, or a loan silently and
    permanently loses commission eligibility the instant it's closed."""
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id, status=LoanStatus.CLOSED)

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert loan_id in ids

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    assert create_res.status_code == 201, create_res.text


async def test_loan_closed_without_ever_disbursing_not_eligible(client: AsyncClient) -> None:
    """The flip side of the regression above: a loan that reached a terminal
    status WITHOUT ever passing through DISBURSED (e.g. rejected pre-sanction)
    must not become eligible just because it's now closed/terminal."""
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(
        lead_id=lead_id, status=LoanStatus.REJECTED, disbursed_at=None
    )

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert loan_id not in ids

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    assert create_res.status_code == 409, create_res.text


async def test_eligible_deals_includes_closed_property_deal(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("real_estate")
    lead_id = await _seed_lead(
        business_line="real_estate", origin_agent_profile_uuid=agent_profile_uuid
    )
    deal_id = await _seed_property_deal(lead_id=lead_id)

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    ids = [d["deal_uuid"] for d in res.json()["deals"]]
    assert deal_id in ids


# ---------------------------------------------------------------------------
# Create — happy path + agent/line/lead-from-row invariant
# ---------------------------------------------------------------------------


async def test_create_commission_happy_path_loan(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid, agent_code = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={
            "deal_type": "loan_application",
            "deal_uuid": loan_id,
            "agreed_amount_paise": 75_000,
            "notes": "negotiated 1:1",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["agent_profile_uuid"] == agent_profile_uuid
    assert body["agent_code"] == agent_code
    assert body["business_line"] == "loans"
    assert body["deal_type"] == "loan_application"
    assert body["deal_uuid"] == loan_id
    assert body["agreed_amount_paise"] == 75_000
    assert body["status"] == "pending"

    row = await _get_commission_row(body["id"])
    assert row["agent_auth_user_uuid"] == uuid.UUID(agent_uid)
    assert row["business_line"] == "loans"


async def test_create_commission_happy_path_property_deal(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, agent_code = await _seed_agent("real_estate")
    lead_id = await _seed_lead(
        business_line="real_estate", origin_agent_profile_uuid=agent_profile_uuid
    )
    deal_id = await _seed_property_deal(lead_id=lead_id)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "property_deal", "deal_uuid": deal_id, "agreed_amount_paise": 120_000},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["agent_code"] == agent_code
    assert body["business_line"] == "real_estate"
    assert body["deal_type"] == "property_deal"


async def test_create_commission_non_disbursed_loan_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id, status=LoanStatus.SUBMITTED_TO_BANK)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    assert res.status_code == 409, res.text


async def test_create_commission_no_origin_agent_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=None)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    assert res.status_code == 409, res.text


async def test_create_commission_unknown_deal_404s(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={
            "deal_type": "loan_application",
            "deal_uuid": str(uuid.uuid4()),
            "agreed_amount_paise": 50_000,
        },
    )
    assert res.status_code == 404, res.text


async def test_double_entry_on_same_deal_conflicts(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    body = {"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000}
    res1 = await client.post("/api/v1/admin/commissions", headers=_headers(admin_token), json=body)
    assert res1.status_code == 201, res1.text

    res2 = await client.post("/api/v1/admin/commissions", headers=_headers(admin_token), json=body)
    assert res2.status_code == 409, res2.text


async def test_amount_and_agent_come_from_deal_not_body(client: AsyncClient) -> None:
    """No field in CommissionCreate can name an agent or a line — this pins
    that a maliciously/accidentally supplied extra key is simply ignored."""
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, agent_code = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={
            "deal_type": "loan_application",
            "deal_uuid": loan_id,
            "agreed_amount_paise": 50_000,
            "agent_profile_uuid": str(uuid.uuid4()),  # ignored — not a schema field
            "business_line": "real_estate",  # ignored — not a schema field
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["agent_code"] == agent_code
    assert res.json()["business_line"] == "loans"


# ---------------------------------------------------------------------------
# Role gating
# ---------------------------------------------------------------------------


async def test_line_scoped_admin_rejected(client: AsyncClient) -> None:
    """Same guard reporting.py and referrals.py both need: RLS's admin bypass
    requires platform_scope='true', not just role='admin'."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    token = _admin_token(uid, platform_scope="line")

    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(token))
    assert res.status_code == 403


async def test_sub_admin_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    token = create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "", "platform_scope": "true"}
    )
    res = await client.get("/api/v1/admin/commissions/eligible", headers=_headers(token))
    assert res.status_code == 403


async def test_agent_forbidden_from_create(client: AsyncClient) -> None:
    agent_uid, agent_profile_uuid, _ = await _seed_agent("loans")
    token = _agent_token(agent_uid, agent_profile_uuid, "loans")
    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(token),
        json={
            "deal_type": "loan_application",
            "deal_uuid": str(uuid.uuid4()),
            "agreed_amount_paise": 50_000,
        },
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


async def test_cancel_pending_commission(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    commission_id = create_res.json()["id"]

    cancel_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "duplicate entry"},
    )
    assert cancel_res.status_code == 204, cancel_res.text

    row = await _get_commission_row(commission_id)
    assert row["status"] == "cancelled"

    # A cancelled commission frees the deal for legitimate re-entry.
    retry_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 60_000},
    )
    assert retry_res.status_code == 201, retry_res.text


async def test_cancel_already_cancelled_conflicts(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    commission_id = create_res.json()["id"]
    await client.post(
        f"/api/v1/admin/commissions/{commission_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "first cancel"},
    )
    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "second cancel"},
    )
    assert res.status_code == 409


async def test_cancel_blocked_once_payout_attached(client: AsyncClient) -> None:
    """PR 2 sets payout_uuid; simulated here via direct write since the payout
    endpoint does not exist yet — pins the guard ahead of that slice."""
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    commission_id = create_res.json()["id"]

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(agent_uid),
            business_line="loans",
            type=PayoutType.COMMISSION,
            amount_paise=50_000,
            currency="INR",
            status=PayoutStatus.PENDING_APPROVAL,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(admin_uid),
        )
        db.add(payout)
        await db.flush()
        await db.execute(
            text("UPDATE commissions SET payout_uuid = :p WHERE id = :id"),
            {"p": str(payout.id), "id": commission_id},
        )
        await db.commit()

    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "too late"},
    )
    assert res.status_code == 409


async def test_cancel_unknown_commission_404s(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.post(
        f"/api/v1/admin/commissions/{uuid.uuid4()}/cancel",
        headers=_headers(admin_token),
        json={"reason": "n/a"},
    )
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Oversight list
# ---------------------------------------------------------------------------


async def test_list_filters_by_status(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    create_res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 50_000},
    )
    commission_id = create_res.json()["id"]

    res_pending = await client.get(
        "/api/v1/admin/commissions?status_filter=pending", headers=_headers(admin_token)
    )
    assert commission_id in [c["id"] for c in res_pending.json()["commissions"]]

    res_paid = await client.get(
        "/api/v1/admin/commissions?status_filter=paid", headers=_headers(admin_token)
    )
    assert commission_id not in [c["id"] for c in res_paid.json()["commissions"]]


async def test_list_rejects_invalid_business_line(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.get(
        "/api/v1/admin/commissions?business_line=garbage", headers=_headers(admin_token)
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Amount bounds
# ---------------------------------------------------------------------------


async def test_create_zero_amount_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": 0},
    )
    assert res.status_code == 422, res.text


async def test_create_negative_amount_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={"deal_type": "loan_application", "deal_uuid": loan_id, "agreed_amount_paise": -100},
    )
    assert res.status_code == 422, res.text


async def test_create_amount_over_cap_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, agent_profile_uuid, _ = await _seed_agent("loans")
    lead_id = await _seed_lead(business_line="loans", origin_agent_profile_uuid=agent_profile_uuid)
    loan_id = await _seed_loan_application(lead_id=lead_id)

    res = await client.post(
        "/api/v1/admin/commissions",
        headers=_headers(admin_token),
        json={
            "deal_type": "loan_application",
            "deal_uuid": loan_id,
            "agreed_amount_paise": 10_000_000_001,
        },
    )
    assert res.status_code == 422, res.text
