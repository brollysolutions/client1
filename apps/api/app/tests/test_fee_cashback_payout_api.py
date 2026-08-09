"""POST /api/v1/admin/fee-cashbacks/{id}/payout — payout execution (FR-6.6).
Covers role gating, the amount/recipient-from-the-row invariant, the
pending<->paid<->failed state machine driven off services.payments, the
acceptance moment (a settled cashback payout lands in the client's own
transaction ledger), and a manually-created unlinked CASHBACK payout (already
possible today via the admin manual-payout picker) settling cleanly with no
crash.

Runs in mock payment mode (no RAZORPAY_* creds), same as
test_commission_payout_api.py: approve settles to paid locally and emits the
client ledger row without a webhook.
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
from app.models.fee_cashback import FeeCashback, FeeCashbackStatus
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import FeeOutcome, LoanApplication, LoanStatus, LoanType
from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
from app.models.profile import ClientProfile, ProfileStatus
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


async def _seed_client(business_line: str = "loans") -> tuple[str, str]:
    """Returns (auth_user_uuid, client_profile_uuid). A plain client account,
    distinct from any admin actor in the same test — create_payout forbids
    maker == recipient (SelfPayoutForbidden)."""
    import app.db.session as _session_mod

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
        profile = ClientProfile(
            auth_user_uuid=user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _seed_application(client_profile_uuid: str, business_line: str = "loans") -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([lead, loan_type])
        await db.flush()
        loan = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            business_line=business_line,
            loan_type_id=loan_type.id,
            amount_requested=100000,
            processing_fee=5000.00,
            fee_outcome=FeeOutcome.CASHBACK,
            status=LoanStatus.DISBURSED,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
            disbursed_at=datetime.now(UTC),
        )
        db.add(loan)
        await db.commit()
        return str(loan.id)


async def _seed_cashback(
    *,
    recipient_auth_user_uuid: str,
    client_profile_uuid: str,
    business_line: str,
    entered_by_uuid: str,
    amount_paise: int = 50_000,
    status: FeeCashbackStatus = FeeCashbackStatus.PENDING,
    payout_uuid: str | None = None,
) -> str:
    """Writes a fee_cashbacks row directly, skipping the whole
    eligible-queue -> create_fee_cashback pipeline: these tests are about the
    Admin payout-execution surface, not entry mechanics (covered by
    test_fee_cashback_api.py)."""
    import app.db.session as _session_mod

    loan_id = await _seed_application(client_profile_uuid, business_line)

    async with _session_mod.AsyncSessionLocal() as db:
        cashback = FeeCashback(
            loan_application_uuid=uuid.UUID(loan_id),
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            recipient_auth_user_uuid=uuid.UUID(recipient_auth_user_uuid),
            business_line=business_line,
            processing_fee_paise=500_000,
            amount_paise=amount_paise,
            status=status,
            entered_by_uuid=uuid.UUID(entered_by_uuid),
            payout_uuid=uuid.UUID(payout_uuid) if payout_uuid else None,
        )
        db.add(cashback)
        await db.commit()
        return str(cashback.id)


async def _seed_dummy_payout(recipient_uuid: str, maker_uuid: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uuid),
            business_line="loans",
            type=PayoutType.CASHBACK,
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


async def _get_cashback_row(cashback_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT status, payout_uuid, payout_txn_uuid, amount_paise "
                    "FROM fee_cashbacks WHERE id = :id"
                ),
                {"id": cashback_id},
            )
        ).fetchone()
        assert row is not None
        return {
            "status": row[0],
            "payout_uuid": row[1],
            "payout_txn_uuid": row[2],
            "amount_paise": row[3],
        }


# ---------------------------------------------------------------------------
# POST /{id}/payout — happy path, guards, amount-from-row invariant
# ---------------------------------------------------------------------------


async def test_pay_cashback_happy_path(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=50_000,
    )

    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 201, res.text
    payout_id = res.json()["payout_id"]

    row = await _get_cashback_row(cashback_id)
    assert row["status"] == "pending"  # not yet paid — only approve settles it
    assert str(row["payout_uuid"]) == payout_id

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        p = await db.get(Payout, uuid.UUID(payout_id))
        assert p.status.value == "pending_approval"
        assert p.amount_paise == 50_000
        assert p.type.value == "cashback"
        assert p.recipient_user_uuid == uuid.UUID(client_uid)
        assert p.maker_user_uuid == uuid.UUID(admin_uid)


async def test_amount_and_recipient_come_from_cashback_not_body(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=12_345,
    )

    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(amount_paise=999_999_999, recipient_user_uuid=str(uuid.uuid4())),
    )
    assert res.status_code == 201, res.text
    payout_id = res.json()["payout_id"]

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        p = await db.get(Payout, uuid.UUID(payout_id))
        assert p.amount_paise == 12_345
        assert p.recipient_user_uuid == uuid.UUID(client_uid)


async def test_pay_cashback_guards_non_pending_status(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    for status in (FeeCashbackStatus.PAID, FeeCashbackStatus.CANCELLED):
        # A fresh client per iteration: loan_applications has a partial-unique
        # index on client_profile_uuid WHERE status NOT IN ('closed','rejected'),
        # and _seed_application always creates a DISBURSED (non-terminal) row.
        client_uid, client_profile_uuid = await _seed_client("loans")
        cashback_id = await _seed_cashback(
            recipient_auth_user_uuid=client_uid,
            client_profile_uuid=client_profile_uuid,
            business_line="loans",
            entered_by_uuid=admin_uid,
            status=status,
        )
        res = await client.post(
            f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
            headers=_headers(admin_token),
            json=_payout_body(),
        )
        assert res.status_code == 409, f"status={status}: {res.text}"


async def test_pay_cashback_guards_already_linked(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    existing_payout_id = await _seed_dummy_payout(client_uid, admin_uid)
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        payout_uuid=existing_payout_id,
    )
    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 409


async def test_pay_cashback_unknown_cashback_404s(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{uuid.uuid4()}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 404


async def test_pay_cashback_non_admin_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    sub_admin_token = _token(await _auth_user_id(mobile), role="sub_admin")
    admin_token, admin_uid = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(sub_admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 403
    # sanity: an actual admin can (proves the cashback itself was seeded fine)
    res2 = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res2.status_code == 201


async def test_pay_cashback_respects_per_payout_cap(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PAYOUT_MAX_AMOUNT_PAISE", 10_000)
    admin_token, admin_uid = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=50_000,
    )

    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 422

    row = await _get_cashback_row(cashback_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None  # the rejected create never got linked


# ---------------------------------------------------------------------------
# Settlement — pending -> paid, and the acceptance moment
# ---------------------------------------------------------------------------


async def test_settlement_flips_cashback_to_paid_and_credits_client(client: AsyncClient) -> None:
    maker_token, admin_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
        amount_paise=50_000,
    )

    create_res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert create_res.status_code == 201, create_res.text
    payout_id = create_res.json()["payout_id"]

    approve_res = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approve_res.status_code == 200, approve_res.text  # mock mode settles synchronously

    row = await _get_cashback_row(cashback_id)
    assert row["status"] == "paid"
    assert row["payout_txn_uuid"] is not None

    # The reward lands in the client's OWN transaction history.
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
    assert str(txn[0]) == client_uid
    assert txn[1] == "cashback"
    assert txn[2] == 50_000
    assert txn[3] == "Cashback payout"


async def test_mark_paid_is_idempotent(client: AsyncClient) -> None:
    """Two settle calls for the same payout must never double-flip or double-credit."""
    from app.services import fee_cashbacks as fee_cashbacks_service

    maker_token, admin_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    create_res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]
    await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token))

    row_after_first = await _get_cashback_row(cashback_id)
    assert row_after_first["status"] == "paid"
    first_txn = row_after_first["payout_txn_uuid"]

    # Second call with a different transaction id must be a no-op (the CAS in
    # mark_paid_from_payout only matches status='pending').
    await fee_cashbacks_service.mark_paid_from_payout(
        payout_id=uuid.UUID(payout_id), transaction_id=uuid.uuid4()
    )
    row_after_second = await _get_cashback_row(cashback_id)
    assert row_after_second["payout_txn_uuid"] == first_txn


async def test_rejected_payout_releases_cashback_for_retry(client: AsyncClient) -> None:
    maker_token, admin_uid = await _make_admin(client)
    rejector_token, _ = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    create_res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
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

    row = await _get_cashback_row(cashback_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None
    assert row["payout_txn_uuid"] is None

    # Payable again: a second payout create succeeds against the same cashback.
    retry_res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert retry_res.status_code == 201, retry_res.text


async def test_concurrent_pay_cashback_creates_no_orphan_payout(client: AsyncClient) -> None:
    """Two simultaneous 'Pay cashback' calls for the SAME cashback must never
    both succeed. The deterministic per-cashback idempotency key means the
    loser doesn't even leave a live, unlinked payout behind — asserts exactly
    one payout row exists for the client afterward."""
    admin_token, admin_uid = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    results = await asyncio.gather(
        client.post(
            f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
            headers=_headers(admin_token),
            json=_payout_body(),
        ),
        client.post(
            f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
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
                    "AND type = 'cashback'"
                ),
                {"uid": client_uid},
            )
        ).scalar()
    assert count == 1

    row = await _get_cashback_row(cashback_id)
    assert row["payout_uuid"] is not None


async def test_reversal_after_paid_frees_cashback_for_retry(client: AsyncClient) -> None:
    """The one backward edge in the state machine: a payout that settled to
    paid and was later reversed by the gateway must free the cashback again,
    not leave it permanently stuck 'paid' with no money delivered."""
    maker_token, admin_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    create_res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]
    approve_res = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approve_res.status_code == 200, approve_res.text

    paid_row = await _get_cashback_row(cashback_id)
    assert paid_row["status"] == "paid"

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = await db.get(Payout, uuid.UUID(payout_id))
        gateway_payout_id = payout.gateway_payout_id
    assert gateway_payout_id is not None

    await payments_service.settle_from_webhook(
        event="payout.reversed", gateway_payout_id=gateway_payout_id
    )

    row = await _get_cashback_row(cashback_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None
    assert row["payout_txn_uuid"] is None

    # Payable again.
    retry_res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert retry_res.status_code == 201, retry_res.text


async def test_attach_failure_rejects_the_orphan_payout(client: AsyncClient, monkeypatch) -> None:
    """If the cashback stops being pending between create_payout succeeding
    and attach_payout's CAS, the router must best-effort reject the payout it
    just created rather than leave a live pending_approval artifact with
    nothing pointing at it. Forces the branch directly via monkeypatch since
    the real race window is a few microseconds wide."""
    from app.services import fee_cashbacks as fee_cashbacks_service

    admin_token, admin_uid = await _make_admin(client)
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(
        recipient_auth_user_uuid=client_uid,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
        entered_by_uuid=admin_uid,
    )

    async def _always_fails_to_attach(*, cashback_id, payout_id):
        return False

    monkeypatch.setattr(fee_cashbacks_service, "attach_payout", _always_fails_to_attach)

    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 409, res.text
    assert "concurrently" in res.json()["detail"].lower()

    row = await _get_cashback_row(cashback_id)
    assert row["status"] == "pending"
    assert row["payout_uuid"] is None

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                "SELECT status FROM payouts WHERE recipient_user_uuid = :uid AND type = 'cashback'"
            ),
            {"uid": client_uid},
        )
        statuses = [r[0] for r in result.fetchall()]
    assert statuses == ["rejected"], statuses


# ---------------------------------------------------------------------------
# R14 — a manually-created, unlinked CASHBACK payout (payout-form.ts already
# offers this type in the admin manual-payout picker) must settle cleanly.
# ---------------------------------------------------------------------------


async def test_manual_unlinked_cashback_payout_settles_cleanly(client: AsyncClient) -> None:
    """A CASHBACK payout created via the generic /payouts endpoint (no
    fee_cashbacks row at all) must settle without error: mark_paid_from_payout
    and release_payout_link both match on payout_uuid and simply update zero
    rows when there is no linked cashback."""
    maker_token, admin_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    client_uid, _ = await _seed_client("loans")

    create_res = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json={
            "recipient_user_uuid": client_uid,
            "type": "cashback",
            "business_line": "loans",
            "amount_paise": 20_000,
            "idempotency_key": uuid.uuid4().hex,
            **_payout_body(),
        },
    )
    assert create_res.status_code == 201, create_res.text
    payout_id = create_res.json()["id"]

    approve_res = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approve_res.status_code == 200, approve_res.text
