"""payouts API — maker-checker flow, safety guards, authz, mock settle E2E.

Admin JWTs are crafted directly (self-registration only ever mints clients),
the same technique as test_loans_create_api.py::_crafted_token: register a real
account to satisfy get_current_user's user lookup + the FK, then sign an admin
claim set for that id.

Runs in mock payment mode (no RAZORPAY_* creds): approve settles to paid locally
and emits the client ledger row without a webhook.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_access_token
from app.services import payments as payments_service
from conftest import full_registration


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


def _admin_token(user_id: str, *, role: str = "admin", platform_scope: str = "true") -> str:
    return create_access_token(
        {"sub": user_id, "role": role, "business_line": "", "platform_scope": platform_scope}
    )


async def _make_admin(client: AsyncClient, *, role: str = "admin") -> tuple[str, str]:
    """Register a throwaway account and return (admin_token, user_id) for it."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _admin_token(uid, role=role), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_body(recipient_uid: str, *, amount_paise: int = 50_000, **overrides) -> dict:
    body = {
        "recipient_user_uuid": recipient_uid,
        "type": "referral_bonus",
        "amount_paise": amount_paise,
        "destination_type": "vpa",
        "destination": {"vpa": "9876543210@okhdfc"},
        "idempotency_key": uuid.uuid4().hex,
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# authz
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/payouts", json=_create_body(str(uuid.uuid4())))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_rejects_client(client: AsyncClient) -> None:
    client_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    resp = await client.post(
        "/api/v1/payouts", headers=_headers(client_token), json=_create_body(recipient_uid)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_rejects_line_staff(client: AsyncClient) -> None:
    _, staff_uid = await _make_admin(client)
    line_staff_token = _admin_token(staff_uid, role="sub_admin", platform_scope="false")
    resp = await client.post(
        "/api/v1/payouts",
        headers=_headers(line_staff_token),
        json=_create_body(str(uuid.uuid4())),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# create success + masking
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_success_masks_destination(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client, role="sub_admin")
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["status"] == "pending_approval"
    assert data["destination_hint"] == "***@okhdfc"
    # Raw VPA local-part must never appear in the response.
    assert "9876543210" not in resp.text


@pytest.mark.asyncio
async def test_create_validation_failure(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    # bank_account destination_type but no ifsc/account_number.
    body = _create_body(recipient_uid, destination_type="bank_account", destination={})
    resp = await client.post("/api/v1/payouts", headers=_headers(maker_token), json=body)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# safety guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guard_recipient_must_exist(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    resp = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(str(uuid.uuid4())),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_guard_per_payout_cap(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PAYOUT_MAX_AMOUNT_PAISE", 10_000)
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, amount_paise=20_000),
    )
    assert resp.status_code == 422


async def _today_payout_total() -> int:
    """Current day's non-dead payout sum — the same window the service caps on.

    The cap is a GLOBAL (platform-wide) blast-radius guard, and the test DB is
    shared/not cleaned between tests, so the cap must be set relative to the
    existing baseline rather than an absolute value.
    """
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT COALESCE(SUM(amount_paise), 0) FROM payouts "
                    "WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') "
                    "AND status NOT IN ('rejected','failed','reversed')"
                )
            )
        ).fetchone()
        return int(row[0])


@pytest.mark.asyncio
async def test_guard_daily_cap(client: AsyncClient, monkeypatch) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    # Set the cap so exactly one more 50k payout fits above the current baseline.
    baseline = await _today_payout_total()
    monkeypatch.setattr(settings, "PAYOUT_DAILY_CAP_PAISE", baseline + 75_000)

    first = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, amount_paise=50_000),
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, amount_paise=50_000),
    )
    assert second.status_code == 422


@pytest.mark.asyncio
async def test_guard_dedupe_and_rejected_frees_key(client: AsyncClient) -> None:
    maker_token, maker_uid = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    key = uuid.uuid4().hex
    body = _create_body(recipient_uid, amount_paise=50_000, idempotency_key=key)

    first = await client.post("/api/v1/payouts", headers=_headers(maker_token), json=body)
    assert first.status_code == 201
    payout_id = first.json()["id"]

    # Same natural key within the window → duplicate.
    dup = await client.post("/api/v1/payouts", headers=_headers(maker_token), json=body)
    assert dup.status_code == 409

    # Reject the first → its key is freed (terminal-dead state).
    rej = await client.post(
        f"/api/v1/payouts/{payout_id}/reject",
        headers=_headers(checker_token),
        json={"reason": "duplicate entry"},
    )
    assert rej.status_code == 200
    assert rej.json()["status"] == "rejected"

    retry = await client.post("/api/v1/payouts", headers=_headers(maker_token), json=body)
    assert retry.status_code == 201


# ---------------------------------------------------------------------------
# maker-checker
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_maker_cannot_approve_own_payout(client: AsyncClient) -> None:
    maker_token, maker_uid = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    resp = await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(maker_token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_approve_non_pending_conflicts(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    first = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert first.status_code == 200
    # Re-approving a settled payout is a conflict.
    second = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_sub_admin_cannot_approve(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    sub_admin_token, _ = await _make_admin(client, role="sub_admin")
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    resp = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(sub_admin_token)
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# mock settle E2E
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mock_settle_emits_ledger_row(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    recipient_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, amount_paise=123_400),
    )
    payout_id = created.json()["id"]

    approved = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["status"] == "paid"
    assert body["gateway_payout_id"].startswith("pout_mock_")

    # The recipient's client ledger now shows exactly the emitted paid row.
    ledger = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    assert ledger.status_code == 200
    txns = ledger.json()["transactions"]
    assert len(txns) == 1
    assert txns[0]["status"] == "paid"
    assert txns[0]["amount_paise"] == 123_400
    assert txns[0]["type"] == "referral_bonus"


@pytest.mark.asyncio
async def test_list_payouts_admin_only(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )

    listed = await client.get("/api/v1/payouts", headers=_headers(maker_token))
    assert listed.status_code == 200
    assert len(listed.json()["payouts"]) >= 1

    # A client cannot list payouts.
    client_token, _ = await full_registration(client, lines=["loans"])
    denied = await client.get("/api/v1/payouts", headers=_headers(client_token))
    assert denied.status_code == 403


# ---------------------------------------------------------------------------
# insider-fraud guards (self-payout)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_maker_cannot_pay_self(client: AsyncClient) -> None:
    maker_token, maker_uid = await _make_admin(client)
    # recipient == maker → blocked at create.
    resp = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(maker_uid)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_checker_cannot_approve_payout_to_self(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, checker_uid = await _make_admin(client)
    # Payout to the checker's own account; a different maker creates it.
    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(checker_uid)
    )
    assert created.status_code == 201
    payout_id = created.json()["id"]
    resp = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_recipient_suspended_rejected(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE auth_users SET status = 'suspended' WHERE id = :i"),
            {"i": recipient_uid},
        )
        await db.commit()

    resp = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# reject by maker, bank destination, business_line propagation, status filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_maker_can_reject_own_payout(client: AsyncClient) -> None:
    """Reject is not value-moving, so the maker may reject their own payout."""
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    resp = await client.post(
        f"/api/v1/payouts/{payout_id}/reject",
        headers=_headers(maker_token),
        json={"reason": "created in error"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_bank_account_destination_masked(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    body = _create_body(
        recipient_uid,
        destination_type="bank_account",
        destination={"ifsc": "HDFC0001234", "account_number": "50100123456789", "name": "R Kumar"},
    )
    resp = await client.post("/api/v1/payouts", headers=_headers(maker_token), json=body)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["destination_type"] == "bank_account"
    assert data["destination_hint"] == "HDFC ****6789"
    # Full account number must never appear in the response.
    assert "50100123456789" not in resp.text


@pytest.mark.asyncio
async def test_business_line_propagates_to_ledger(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, business_line="loans", type="cashback"),
    )
    payout_id = created.json()["id"]
    approved = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approved.json()["status"] == "paid"

    # The emitted ledger row inherits business_line (not exposed via the API schema).
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT t.business_line, t.type FROM transactions t "
                    "JOIN payouts p ON p.ledger_transaction_id = t.id WHERE p.id = :i"
                ),
                {"i": payout_id},
            )
        ).fetchone()
    assert row is not None
    assert str(row[0]) == "loans"
    assert str(row[1]) == "cashback"


@pytest.mark.asyncio
async def test_list_status_filter(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    pending_id = created.json()["id"]

    # Filtering by rejected must exclude our pending row and return only rejected.
    listed = await client.get(
        "/api/v1/payouts?status_filter=rejected", headers=_headers(maker_token)
    )
    assert listed.status_code == 200
    payouts = listed.json()["payouts"]
    assert all(p["status"] == "rejected" for p in payouts)
    assert pending_id not in [p["id"] for p in payouts]


# ---------------------------------------------------------------------------
# concurrency + failure path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_approve_emits_single_ledger_row(client: AsyncClient) -> None:
    """Two admins approving the same payout at once must not double-pay."""
    maker_token, _ = await _make_admin(client)
    checker_a, _ = await _make_admin(client)
    checker_b, _ = await _make_admin(client)
    recipient_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    results = await asyncio.gather(
        client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_a)),
        client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_b)),
    )
    codes = sorted(r.status_code for r in results)
    # Exactly one approval wins; the other is a conflict.
    assert codes == [200, 409]

    # And the recipient's ledger has exactly ONE paid row — no double emission.
    ledger = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    assert len(ledger.json()["transactions"]) == 1


@pytest.mark.asyncio
async def test_initiate_failure_marks_failed_no_ledger(client: AsyncClient, monkeypatch) -> None:
    """A settle fault leaves the payout FAILED and emits no ledger row."""

    async def _boom(db, payout):  # noqa: ANN001, ARG001
        raise RuntimeError("settle blew up")

    monkeypatch.setattr(payments_service, "_settle_paid", _boom)

    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    recipient_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    approved = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    # approve endpoint still returns 200; initiate is best-effort and failed.
    assert approved.status_code == 200
    assert approved.json()["status"] == "failed"

    ledger = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    assert ledger.json()["transactions"] == []
