"""POST /api/v1/admin/commissions/{id}/payout — payout execution (PR 2).
Covers role gating, the amount/recipient-from-the-row invariant, the
pending<->paid<->failed state machine driven off services.payments, and the
acceptance moment (a settled commission payout lands in the agent's own
transaction ledger).

Runs in mock payment mode (no RAZORPAY_* creds), same as
test_referrals_admin_api.py / test_payouts_api.py: approve settles to paid
locally and emits the client ledger row without a webhook.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_access_token
from app.models.commission import Commission, CommissionStatus
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus, LoanType
from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus
from app.models.user import User
from app.services import payments as payments_service
from conftest import full_registration, unique_mobile

pytestmark = pytest.mark.asyncio


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


def _token(user_id: str, *, role: str, platform_scope: str = "true") -> str:
    return create_access_token(
        {"sub": user_id, "role": role, "business_line": "", "platform_scope": platform_scope}
    )


async def _make_admin(client: AsyncClient) -> tuple[str, str]:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _token(uid, role="admin"), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _payout_body(**overrides) -> dict:
    body = {
        "destination_type": "vpa",
        "destination": {"vpa": "9876543210@okhdfc"},
    }
    body.update(overrides)
    return body


async def _seed_agent(business_line: str = "loans") -> tuple[str, str]:
    """Returns (auth_user_uuid, agent_profile_uuid). A plain agent account,
    distinct from any admin actor in the same test — create_payout forbids
    maker == recipient (SelfPayoutForbidden)."""
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


async def _seed_deal(agent_profile_uuid: str, business_line: str = "loans") -> tuple[str, str]:
    """A disbursed loan application with the given origin agent. Returns
    (lead_id, loan_application_id)."""
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
    *,
    agent_auth_user_uuid: str,
    agent_profile_uuid: str,
    business_line: str,
    entered_by_uuid: str,
    amount_paise: int = 50_000,
    status: CommissionStatus = CommissionStatus.PENDING,
    payout_uuid: str | None = None,
) -> str:
    """Writes a commissions row directly, skipping the whole
    eligible-queue -> create_commission pipeline: these tests are about the
    Admin payout-execution surface, not entry mechanics (covered by
    test_commission_api.py)."""
    import app.db.session as _session_mod

    lead_id, loan_id = await _seed_deal(agent_profile_uuid, business_line)

    async with _session_mod.AsyncSessionLocal() as db:
        commission = Commission(
            agent_auth_user_uuid=uuid.UUID(agent_auth_user_uuid),
            agent_profile_uuid=uuid.UUID(agent_profile_uuid),
            business_line=business_line,
            lead_uuid=uuid.UUID(lead_id),
            loan_application_uuid=uuid.UUID(loan_id),
            agreed_amount_paise=amount_paise,
            status=status,
            entered_by_uuid=uuid.UUID(entered_by_uuid),
            payout_uuid=uuid.UUID(payout_uuid) if payout_uuid else None,
        )
        db.add(commission)
        await db.commit()
        return str(commission.id)


async def _seed_dummy_payout(recipient_uuid: str, maker_uuid: str) -> str:
    """A minimal, valid payouts row — payout_uuid is a real FK, so
    test_pay_commission_guards_already_linked needs an actual payout to
    point at, not a bare random uuid."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uuid),
            type=PayoutType.COMMISSION,
            amount_paise=50_000,
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


async def _get_commission_row(commission_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT status, payout_uuid, payout_txn_uuid, agreed_amount_paise "
                    "FROM commissions WHERE id = :id"
                ),
                {"id": commission_id},
            )
        ).fetchone()
        assert row is not None
        return {
            "status": row[0],
            "payout_uuid": row[1],
            "payout_txn_uuid": row[2],
            "agreed_amount_paise": row[3],
        }


# ---------------------------------------------------------------------------
# POST /{id}/payout — happy path, guards, amount-from-row invariant
# ---------------------------------------------------------------------------


async def test_pay_commission_happy_path(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=50_000,
    )

    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 201, res.text
    payout_id = res.json()["payout_id"]

    row = await _get_commission_row(commission_id)
    assert row["status"] == "pending"  # not yet paid — only approve settles it
    assert str(row["payout_uuid"]) == payout_id

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        p = await db.get(Payout, uuid.UUID(payout_id))
        assert p.status.value == "pending_approval"
        assert p.amount_paise == 50_000
        assert p.type.value == "commission"
        assert p.recipient_user_uuid == uuid.UUID(agent_uid)
        assert p.maker_user_uuid == uuid.UUID(admin_uid)


async def test_amount_and_recipient_come_from_commission_not_body(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=12_345,
    )

    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(amount_paise=999_999_999, recipient_user_uuid=str(uuid.uuid4())),
    )
    assert res.status_code == 201, res.text
    payout_id = res.json()["payout_id"]

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        p = await db.get(Payout, uuid.UUID(payout_id))
        assert p.amount_paise == 12_345
        assert p.recipient_user_uuid == uuid.UUID(agent_uid)


async def test_pay_commission_guards_non_pending_status(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    for status in (CommissionStatus.PAID, CommissionStatus.CANCELLED):
        commission_id = await _seed_commission(
            agent_auth_user_uuid=agent_uid,
            agent_profile_uuid=agent_profile_uuid,
            business_line="loans",
            entered_by_uuid=admin_uid,
            status=status,
        )
        res = await client.post(
            f"/api/v1/admin/commissions/{commission_id}/payout",
            headers=_headers(admin_token),
            json=_payout_body(),
        )
        assert res.status_code == 409, f"status={status}: {res.text}"


async def test_pay_commission_guards_already_linked(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    existing_payout_id = await _seed_dummy_payout(agent_uid, admin_uid)
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        payout_uuid=existing_payout_id,
    )
    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 409


async def test_pay_commission_unknown_commission_404s(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.post(
        f"/api/v1/admin/commissions/{uuid.uuid4()}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 404


async def test_pay_commission_non_admin_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    sub_admin_token = _token(await _auth_user_id(mobile), role="sub_admin")
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(sub_admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 403
    # sanity: an actual admin can (proves the commission itself was seeded fine)
    res2 = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res2.status_code == 201


async def test_pay_commission_respects_per_payout_cap(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PAYOUT_MAX_AMOUNT_PAISE", 10_000)
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=50_000,
    )

    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 422

    row = await _get_commission_row(commission_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None  # the rejected create never got linked


# ---------------------------------------------------------------------------
# Settlement — pending -> paid, and the acceptance moment
# ---------------------------------------------------------------------------


async def test_settlement_flips_commission_to_paid_and_credits_agent(client: AsyncClient) -> None:
    maker_token, admin_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=50_000,
    )

    create_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert create_res.status_code == 201, create_res.text
    payout_id = create_res.json()["payout_id"]

    approve_res = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approve_res.status_code == 200, approve_res.text  # mock mode settles synchronously

    row = await _get_commission_row(commission_id)
    assert row["status"] == "paid"
    assert row["payout_txn_uuid"] is not None

    # The reward lands in the agent's OWN transaction history.
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        txn = (
            await db.execute(
                text(
                    "SELECT user_uuid, type, amount_paise, description FROM transactions "
                    "WHERE id = :id"
                ),
                {"id": str(row["payout_txn_uuid"])},
            )
        ).fetchone()
    assert txn is not None
    assert str(txn[0]) == agent_uid
    assert txn[1] == "commission"
    assert txn[2] == 50_000
    assert txn[3] == "Commission payout"


async def test_mark_paid_is_idempotent(client: AsyncClient) -> None:
    """Two settle calls for the same payout must never double-flip or double-credit."""
    from app.services import commissions as commissions_service

    maker_token, admin_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    create_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]
    await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token))

    row_after_first = await _get_commission_row(commission_id)
    assert row_after_first["status"] == "paid"
    first_txn = row_after_first["payout_txn_uuid"]

    # Second call with a different transaction id must be a no-op (the CAS in
    # mark_paid_from_payout only matches status='pending').
    await commissions_service.mark_paid_from_payout(
        payout_id=uuid.UUID(payout_id), transaction_id=uuid.uuid4()
    )
    row_after_second = await _get_commission_row(commission_id)
    assert row_after_second["payout_txn_uuid"] == first_txn


async def test_rejected_payout_releases_commission_for_retry(client: AsyncClient) -> None:
    maker_token, admin_uid = await _make_admin(client)
    rejector_token, _ = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    create_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]

    reject_res = await client.post(
        f"/api/v1/payouts/{payout_id}/reject",
        headers=_headers(rejector_token),
        json={"reason": "wrong destination"},
    )
    assert reject_res.status_code == 200, reject_res.text

    row = await _get_commission_row(commission_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None
    assert row["payout_txn_uuid"] is None

    # Payable again: a second payout create succeeds against the same commission.
    retry_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert retry_res.status_code == 201, retry_res.text


async def test_concurrent_pay_commission_creates_no_orphan_payout(client: AsyncClient) -> None:
    """Two simultaneous 'Pay commission' calls for the SAME commission must
    never both succeed. The deterministic per-commission idempotency key
    means the loser doesn't even leave a live, unlinked payout behind —
    asserts exactly one payout row exists for the agent afterward."""
    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    results = await asyncio.gather(
        client.post(
            f"/api/v1/admin/commissions/{commission_id}/payout",
            headers=_headers(admin_token),
            json=_payout_body(),
        ),
        client.post(
            f"/api/v1/admin/commissions/{commission_id}/payout",
            headers=_headers(admin_token),
            json=_payout_body(),
        ),
    )
    statuses = sorted(r.status_code for r in results)
    assert statuses == [201, 409], [r.text for r in results]

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        count = (
            await db.execute(
                text(
                    "SELECT COUNT(*) FROM payouts WHERE recipient_user_uuid = :uid "
                    "AND type = 'commission'"
                ),
                {"uid": agent_uid},
            )
        ).scalar()
    assert count == 1

    row = await _get_commission_row(commission_id)
    assert row["payout_uuid"] is not None


async def test_sub_admin_cannot_reject_commission_payout(client: AsyncClient) -> None:
    """commissions_update RLS is full-Admin only (IDR §5.5) — rejecting a
    commission payout runs services.commissions.release_payout_link on the
    bypass session, and the generic _require_platform_admin gate on
    /payouts/{id}/reject would otherwise let a Sub Admin indirectly write to
    state they have no direct access to."""
    maker_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    create_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]

    _, sub_admin_mobile = await full_registration(client, lines=["loans"])
    sub_admin_token = _token(await _auth_user_id(sub_admin_mobile), role="sub_admin")

    reject_res = await client.post(
        f"/api/v1/payouts/{payout_id}/reject",
        headers=_headers(sub_admin_token),
        json={"reason": "not my call"},
    )
    assert reject_res.status_code == 403

    # An actual admin still can.
    admin_token, _ = await _make_admin(client)
    reject_res2 = await client.post(
        f"/api/v1/payouts/{payout_id}/reject",
        headers=_headers(admin_token),
        json={"reason": "wrong destination"},
    )
    assert reject_res2.status_code == 200, reject_res2.text
    row = await _get_commission_row(commission_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None


async def test_reversal_after_paid_frees_commission_for_retry(client: AsyncClient) -> None:
    """The one backward edge in the state machine: a payout that settled to
    paid and was later reversed by the gateway must free the commission
    again, not leave it permanently stuck 'paid' with no money delivered."""
    maker_token, admin_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    create_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]
    approve_res = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approve_res.status_code == 200, approve_res.text

    paid_row = await _get_commission_row(commission_id)
    assert paid_row["status"] == "paid"

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = await db.get(Payout, uuid.UUID(payout_id))
        gateway_payout_id = payout.gateway_payout_id
    assert gateway_payout_id is not None

    await payments_service.settle_from_webhook(
        event="payout.reversed", gateway_payout_id=gateway_payout_id
    )

    row = await _get_commission_row(commission_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None
    assert row["payout_txn_uuid"] is None

    # Payable again.
    retry_res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert retry_res.status_code == 201, retry_res.text


async def test_attach_failure_rejects_the_orphan_payout(client: AsyncClient, monkeypatch) -> None:
    """If the commission stops being pending between create_payout succeeding
    and attach_payout's CAS (e.g. it was cancelled by another admin in that
    narrow window — the deterministic idempotency key means the concurrent
    -second-request race itself can't reach this branch, since
    create_payout's own dedupe guard catches that first, see
    test_concurrent_pay_commission_creates_no_orphan_payout), the router must
    best-effort reject the payout it just created rather than leave a live
    pending_approval artifact with nothing pointing at it. Forces the branch
    directly via monkeypatch since the real race window is a few
    microseconds wide and not reliably reproducible from the HTTP layer."""
    from app.services import commissions as commissions_service

    admin_token, admin_uid = await _make_admin(client)
    agent_uid, agent_profile_uuid = await _seed_agent("loans")
    commission_id = await _seed_commission(
        agent_auth_user_uuid=agent_uid,
        agent_profile_uuid=agent_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    async def _always_fails_to_attach(*, commission_id, payout_id):
        return False

    monkeypatch.setattr(commissions_service, "attach_payout", _always_fails_to_attach)

    res = await client.post(
        f"/api/v1/admin/commissions/{commission_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 409, res.text
    assert "concurrently" in res.json()["detail"].lower()

    # The commission itself is untouched (attach never succeeded)...
    row = await _get_commission_row(commission_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None

    # ...but the orphaned payout was rejected, not left dangling pending_approval.
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                "SELECT status FROM payouts WHERE recipient_user_uuid = :uid "
                "AND type = 'commission'"
            ),
            {"uid": agent_uid},
        )
        statuses = [r[0] for r in result.fetchall()]
    assert statuses == ["rejected"], statuses
