"""payouts webhook — fail-closed HMAC verification + idempotent settle.

Seeds a payout in INITIATED state with a known gateway_payout_id (simulating a
real-mode initiate awaiting settlement), then drives the RazorpayX webhook with
a valid/invalid signature. Signature is computed over the EXACT raw bytes sent,
so the body is passed as `content=` (not `json=`) for byte-stable hashing.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from conftest import full_registration

_SECRET = "whsec_test_payouts"


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _seed_initiated_payout(recipient_uid: str, maker_uid: str, gateway_payout_id: str) -> str:
    import app.db.session as _session_mod
    from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uid),
            business_line=None,
            type=PayoutType.COMMISSION,
            amount_paise=250_000,
            currency="INR",
            status=PayoutStatus.INITIATED,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okaxis",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(maker_uid),
            checker_user_uuid=uuid.UUID(maker_uid),
            gateway_payout_id=gateway_payout_id,
            gateway_status="processing",
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


async def _payout_status(payout_id: str) -> tuple[str, str | None]:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT status, ledger_transaction_id FROM payouts WHERE id = :i"),
                {"i": payout_id},
            )
        ).fetchone()
        return str(row[0]), (str(row[1]) if row[1] else None)


def _signed(event: str, gateway_payout_id: str, secret: str) -> tuple[bytes, str]:
    payload = {
        "event": event,
        "payload": {"payout": {"entity": {"id": gateway_payout_id, "status": "processed"}}},
    }
    body = json.dumps(payload).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return body, sig


async def _setup(client: AsyncClient) -> tuple[str, str, str]:
    """Return (payout_id, gateway_payout_id, recipient_token)."""
    recipient_token, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gateway_payout_id = f"pout_{uuid.uuid4().hex[:14]}"
    payout_id = await _seed_initiated_payout(recipient_uid, maker_uid, gateway_payout_id)
    return payout_id, gateway_payout_id, recipient_token


@pytest.mark.asyncio
async def test_valid_processed_settles_and_emits_ledger(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", _SECRET)
    payout_id, gw_id, recipient_token = await _setup(client)

    body, sig = _signed("payout.processed", gw_id, _SECRET)
    resp = await client.post(
        "/api/v1/payouts/webhook/razorpay",
        content=body,
        headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200, resp.text

    status_val, ledger_id = await _payout_status(payout_id)
    assert status_val == "paid"
    assert ledger_id is not None

    ledger = await client.get(
        "/api/v1/transactions", headers={"Authorization": f"Bearer {recipient_token}"}
    )
    txns = ledger.json()["transactions"]
    assert len(txns) == 1
    assert txns[0]["amount_paise"] == 250_000
    assert txns[0]["type"] == "commission"


@pytest.mark.asyncio
async def test_invalid_signature_rejected_no_change(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", _SECRET)
    payout_id, gw_id, _ = await _setup(client)

    body, _sig = _signed("payout.processed", gw_id, _SECRET)
    resp = await client.post(
        "/api/v1/payouts/webhook/razorpay",
        content=body,
        headers={"X-Razorpay-Signature": "deadbeef", "Content-Type": "application/json"},
    )
    assert resp.status_code == 400
    status_val, ledger_id = await _payout_status(payout_id)
    assert status_val == "initiated"
    assert ledger_id is None


@pytest.mark.asyncio
async def test_missing_secret_fail_closed(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "")
    payout_id, gw_id, _ = await _setup(client)

    body, sig = _signed("payout.processed", gw_id, "anything")
    resp = await client.post(
        "/api/v1/payouts/webhook/razorpay",
        content=body,
        headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 400
    status_val, _ = await _payout_status(payout_id)
    assert status_val == "initiated"


@pytest.mark.asyncio
async def test_failed_and_reversed_events(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", _SECRET)

    payout_id, gw_id, _ = await _setup(client)
    body, sig = _signed("payout.failed", gw_id, _SECRET)
    resp = await client.post(
        "/api/v1/payouts/webhook/razorpay",
        content=body,
        headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200
    assert (await _payout_status(payout_id))[0] == "failed"

    payout_id2, gw_id2, _ = await _setup(client)
    body2, sig2 = _signed("payout.reversed", gw_id2, _SECRET)
    resp2 = await client.post(
        "/api/v1/payouts/webhook/razorpay",
        content=body2,
        headers={"X-Razorpay-Signature": sig2, "Content-Type": "application/json"},
    )
    assert resp2.status_code == 200
    assert (await _payout_status(payout_id2))[0] == "reversed"


@pytest.mark.asyncio
async def test_redelivered_processed_no_duplicate_ledger(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", _SECRET)
    payout_id, gw_id, recipient_token = await _setup(client)
    body, sig = _signed("payout.processed", gw_id, _SECRET)
    headers = {"X-Razorpay-Signature": sig, "Content-Type": "application/json"}

    first = await client.post("/api/v1/payouts/webhook/razorpay", content=body, headers=headers)
    assert first.status_code == 200
    second = await client.post("/api/v1/payouts/webhook/razorpay", content=body, headers=headers)
    assert second.status_code == 200

    ledger = await client.get(
        "/api/v1/transactions", headers={"Authorization": f"Bearer {recipient_token}"}
    )
    assert len(ledger.json()["transactions"]) == 1  # no duplicate emission


@pytest.mark.asyncio
async def test_valid_signature_unknown_payout_acked(client: AsyncClient, monkeypatch) -> None:
    """A signed event for an unknown gateway id is acked (200) with no effect."""
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", _SECRET)
    body, sig = _signed("payout.processed", f"pout_{uuid.uuid4().hex[:14]}", _SECRET)
    resp = await client.post(
        "/api/v1/payouts/webhook/razorpay",
        content=body,
        headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_valid_signature_malformed_body_acked(client: AsyncClient, monkeypatch) -> None:
    """A signed but shape-invalid payload is acked (200) so Razorpay stops
    retrying, but changes nothing."""
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", _SECRET)
    body = json.dumps({"event": "payout.processed"}).encode("utf-8")  # missing payload
    sig = hmac.new(_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
    resp = await client.post(
        "/api/v1/payouts/webhook/razorpay",
        content=body,
        headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200
