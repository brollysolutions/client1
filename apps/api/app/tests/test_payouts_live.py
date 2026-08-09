"""Live (real-credential) RazorpayX path — exercised with a mocked httpx
transport, since the mock-mode suite never reaches the HTTP adapter.

Covers the two untested branches gated by ``_is_live()``:
  * the create-time fund-account provisioning + the payout POST (idempotency
    header, body shape, raw PII sent to the gateway but never persisted), and
  * the reconciliation sweep that settles stuck live payouts from the gateway's
    own record (both the webhook-lost and the response-lost cases).

``_is_live()`` is forced true by monkeypatching the RAZORPAY_* creds; every
outbound request is served by an ``httpx.MockTransport`` handler so no network is
touched. The real ``httpx.AsyncClient`` class is captured before patching to
avoid recursion when the factory re-instantiates it with the mock transport.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.models.payout import (
    Payout,
    PayoutDestination,
    PayoutProvider,
    PayoutStatus,
    PayoutType,
)
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.services import payments
from conftest import full_registration

_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _go_live(monkeypatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_live_key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "rzp_test_live_secret")
    monkeypatch.setattr(settings, "RAZORPAYX_ACCOUNT_NUMBER", "2323230000000001")
    assert payments._is_live() is True


def _install_transport(monkeypatch, handler) -> None:
    """Route every httpx request the service makes through a MockTransport."""

    def factory(*args, **kwargs):
        # Keep the real auth= so httpx still applies Basic auth to the request
        # (the MockTransport receives the signed request) — this lets a test catch
        # a regression that drops auth at a call site.
        kwargs["transport"] = httpx.MockTransport(handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(payments.httpx, "AsyncClient", factory)


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


# ---------------------------------------------------------------------------
# Provisioning + payout POST
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_provision_fund_account_vpa(monkeypatch) -> None:
    _go_live(monkeypatch)
    seen: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        body = json.loads(request.content) if request.content else {}
        seen.append((request.url.path, body))
        if request.url.path.endswith("/contacts"):
            return httpx.Response(200, json={"id": "cont_ABC"})
        return httpx.Response(200, json={"id": "fa_XYZ"})

    _install_transport(monkeypatch, handler)

    contact_id, fund_account_id = await payments._provision_fund_account(
        recipient_user_uuid=uuid.uuid4(),
        destination_type=PayoutDestination.VPA,
        destination={"vpa": "alice@okaxis"},
    )
    assert (contact_id, fund_account_id) == ("cont_ABC", "fa_XYZ")
    # Raw VPA is handed to the gateway's fund_accounts call.
    fa_body = next(b for p, b in seen if p.endswith("/fund_accounts"))
    assert fa_body["vpa"]["address"] == "alice@okaxis"
    assert fa_body["account_type"] == "vpa"


@pytest.mark.asyncio
async def test_provision_fund_account_bank(monkeypatch) -> None:
    _go_live(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/contacts"):
            return httpx.Response(200, json={"id": "cont_1"})
        import json

        body = json.loads(request.content)
        assert body["account_type"] == "bank_account"
        assert body["bank_account"]["ifsc"] == "HDFC0000123"
        assert body["bank_account"]["account_number"] == "1234567890"
        return httpx.Response(200, json={"id": "fa_1"})

    _install_transport(monkeypatch, handler)

    contact_id, fund_account_id = await payments._provision_fund_account(
        recipient_user_uuid=uuid.uuid4(),
        destination_type=PayoutDestination.BANK_ACCOUNT,
        destination={"ifsc": "HDFC0000123", "account_number": "1234567890"},
    )
    assert (contact_id, fund_account_id) == ("cont_1", "fa_1")


@pytest.mark.asyncio
async def test_create_gateway_payout_sends_idempotency_header(monkeypatch) -> None:
    _go_live(monkeypatch)
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        captured["header"] = request.headers.get("X-Payout-Idempotency")
        captured["auth"] = request.headers.get("Authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "pout_REAL1", "status": "queued"})

    _install_transport(monkeypatch, handler)

    payout = Payout(
        id=uuid.uuid4(),
        recipient_user_uuid=uuid.uuid4(),
        business_line="loans",
        type=PayoutType.CASHBACK,
        amount_paise=500_00,
        currency="INR",
        status=PayoutStatus.INITIATED,
        destination_type=PayoutDestination.VPA,
        destination_hint="***@okaxis",
        idempotency_key="idem-123",
        maker_user_uuid=uuid.uuid4(),
        gateway_fund_account_id="fa_XYZ",
    )
    gw_id, gw_status = await payments._create_gateway_payout(payout)
    assert (gw_id, gw_status) == ("pout_REAL1", "queued")
    assert captured["header"] == "idem-123"
    assert captured["auth"].startswith("Basic ")  # gateway Basic auth reached the call
    assert captured["body"]["fund_account_id"] == "fa_XYZ"
    assert captured["body"]["amount"] == 500_00
    assert captured["body"]["reference_id"] == str(payout.id)
    assert captured["body"]["account_number"] == "2323230000000001"


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------


async def _seed_stuck_payout(
    *,
    recipient_uid: str,
    maker_uid: str,
    gateway_payout_id: str | None,
    status: PayoutStatus = PayoutStatus.INITIATED,
    hours_ago: float = 2,
) -> str:
    """Insert a stuck payout with an old updated_at so it is past the grace
    window the reconciler scans. hours_ago controls the oldest-first scan order."""
    import app.db.session as _session_mod

    stale = datetime.now(UTC) - timedelta(hours=hours_ago)
    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uid),
            business_line="loans",
            type=PayoutType.CASHBACK,
            amount_paise=120_000,
            currency="INR",
            status=status,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okaxis",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(maker_uid),
            checker_user_uuid=uuid.UUID(maker_uid),
            gateway_payout_id=gateway_payout_id,
            gateway_status="processing" if gateway_payout_id else None,
            failure_reason="Gateway reported payout failed."
            if status == PayoutStatus.FAILED
            else None,
            created_at=stale,
            updated_at=stale,
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


async def _payout_row(payout_id: str) -> tuple[str, str | None]:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT status, gateway_payout_id FROM payouts WHERE id = :i"),
                {"i": payout_id},
            )
        ).fetchone()
        return str(row[0]), (str(row[1]) if row[1] else None)


async def _ledger_count(recipient_uid: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return await db.scalar(
            text("SELECT count(*) FROM transactions WHERE user_uuid = :u"), {"u": recipient_uid}
        )


async def _seed_paid_payout(
    *,
    recipient_uid: str,
    maker_uid: str,
    gateway_payout_id: str,
    days_ago: float = 1,
) -> str:
    """Insert a PAID payout with a real ledger row and updated_at set days_ago,
    so it lands inside/outside the audit window as the caller needs. A real
    Transaction row is required (not a fabricated UUID) — ledger_transaction_id
    is a real FK to transactions.id."""
    import app.db.session as _session_mod

    settled_at = datetime.now(UTC) - timedelta(days=days_ago)
    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=uuid.UUID(recipient_uid),
            business_line="loans",
            type=TransactionType.CASHBACK,
            status=TransactionStatus.PAID,
            amount_paise=120_000,
            currency="INR",
            description="Cashback payout",
            reference=gateway_payout_id,
        )
        db.add(txn)
        await db.flush()
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uid),
            business_line="loans",
            type=PayoutType.CASHBACK,
            amount_paise=120_000,
            currency="INR",
            status=PayoutStatus.PAID,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okaxis",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(maker_uid),
            checker_user_uuid=uuid.UUID(maker_uid),
            gateway_payout_id=gateway_payout_id,
            gateway_status="processed",
            ledger_transaction_id=txn.id,
            created_at=settled_at,
            updated_at=settled_at,
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


@pytest.mark.asyncio
async def test_reconcile_settles_webhook_lost_payout(client, monkeypatch) -> None:
    """INITIATED with a gateway id whose webhook never arrived → GET by id, settle."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gw_id = f"pout_{uuid.uuid4().hex[:14]}"
    payout_id = await _seed_stuck_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=gw_id
    )

    # Path-generic: our payout settles as processed; any other stuck payout the
    # global scan happens to include (bypass-session rows persist across tests)
    # answers "queued"/empty so it is harmlessly skipped, not crashed.
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(f"/payouts/{gw_id}"):
            return httpx.Response(200, json={"id": gw_id, "status": "processed"})
        if "reference_id" in request.url.params:
            return httpx.Response(200, json={"items": []})
        return httpx.Response(
            200, json={"id": request.url.path.rsplit("/", 1)[-1], "status": "queued"}
        )

    _install_transport(monkeypatch, handler)

    summary = await payments.reconcile_stuck_payouts()
    assert summary["reconciled"] >= 1
    assert (await _payout_row(payout_id))[0] == "paid"
    assert await _ledger_count(recipient_uid) == 1


@pytest.mark.asyncio
async def test_reconcile_backfills_response_lost_payout(client, monkeypatch) -> None:
    """INITIATED with NO gateway id (POST response lost) → find by reference,
    backfill the id, settle."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    payout_id = await _seed_stuck_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=None
    )
    discovered = f"pout_{uuid.uuid4().hex[:14]}"

    def handler(request: httpx.Request) -> httpx.Response:
        # Our payout (no id known) is found by reference_id; other rows the global
        # scan includes answer empty/queued and are skipped.
        if request.url.params.get("reference_id") == payout_id:
            return httpx.Response(200, json={"items": [{"id": discovered, "status": "processed"}]})
        if "reference_id" in request.url.params:
            return httpx.Response(200, json={"items": []})
        return httpx.Response(
            200, json={"id": request.url.path.rsplit("/", 1)[-1], "status": "queued"}
        )

    _install_transport(monkeypatch, handler)

    summary = await payments.reconcile_stuck_payouts()
    assert summary["reconciled"] >= 1
    status_val, gateway_id = await _payout_row(payout_id)
    assert status_val == "paid"
    assert gateway_id == discovered  # backfilled
    assert await _ledger_count(recipient_uid) == 1


@pytest.mark.asyncio
async def test_reconcile_noop_when_gateway_has_no_record(client, monkeypatch) -> None:
    """No gateway record for a response-lost payout → money never moved, leave it."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    payout_id = await _seed_stuck_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=None
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if "reference_id" in request.url.params:
            return httpx.Response(200, json={"items": []})
        return httpx.Response(
            200, json={"id": request.url.path.rsplit("/", 1)[-1], "status": "queued"}
        )

    _install_transport(monkeypatch, handler)

    await payments.reconcile_stuck_payouts()
    # Gateway has no record of our payout → it is left untouched.
    assert (await _payout_row(payout_id))[0] == "initiated"
    assert await _ledger_count(recipient_uid) == 0


@pytest.mark.asyncio
async def test_reconcile_marks_gateway_rejected_failed(client, monkeypatch) -> None:
    """A stuck payout the gateway reports as `rejected` (terminal) is resolved to
    FAILED, not left in-flight to be re-scanned forever."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gw_id = f"pout_{uuid.uuid4().hex[:14]}"
    payout_id = await _seed_stuck_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=gw_id
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(f"/payouts/{gw_id}"):
            return httpx.Response(200, json={"id": gw_id, "status": "rejected"})
        if "reference_id" in request.url.params:
            return httpx.Response(200, json={"items": []})
        return httpx.Response(
            200, json={"id": request.url.path.rsplit("/", 1)[-1], "status": "queued"}
        )

    _install_transport(monkeypatch, handler)

    await payments.reconcile_stuck_payouts()
    assert (await _payout_row(payout_id))[0] == "failed"
    assert await _ledger_count(recipient_uid) == 0  # no money moved


@pytest.mark.asyncio
async def test_reconcile_one_poison_payout_does_not_block_batch(client, monkeypatch) -> None:
    """A settle failure on the oldest stuck payout must not abort the sweep — the
    newer, healthy payout behind it still reconciles."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gw_poison = f"pout_{uuid.uuid4().hex[:14]}"
    gw_healthy = f"pout_{uuid.uuid4().hex[:14]}"
    # Poison is OLDER so it is scanned first (oldest-first ordering).
    poison_id = await _seed_stuck_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=gw_poison, hours_ago=3
    )
    healthy_id = await _seed_stuck_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=gw_healthy, hours_ago=1
    )

    def handler(request: httpx.Request) -> httpx.Response:
        gw = request.url.path.rsplit("/", 1)[-1]
        if "reference_id" in request.url.params:
            return httpx.Response(200, json={"items": []})
        return httpx.Response(200, json={"id": gw, "status": "processed"})

    _install_transport(monkeypatch, handler)

    # Make the settle raise only for the poison payout.
    orig_settle = payments.settle_from_webhook

    async def flaky_settle(*, event: str, gateway_payout_id: str, provider: PayoutProvider) -> None:
        assert provider == PayoutProvider.RAZORPAYX
        if gateway_payout_id == gw_poison:
            raise RuntimeError("simulated settle fault")
        await orig_settle(
            event=event,
            gateway_payout_id=gateway_payout_id,
            provider=provider,
        )

    monkeypatch.setattr(payments, "settle_from_webhook", flaky_settle)

    # Must not raise despite the poison payout.
    await payments.reconcile_stuck_payouts()

    assert (await _payout_row(poison_id))[0] == "initiated"  # left stuck, retried next tick
    assert (await _payout_row(healthy_id))[0] == "paid"  # not blocked


@pytest.mark.asyncio
async def test_reconcile_leaves_failed_with_gateway_id(client, monkeypatch) -> None:
    """A FAILED payout that already has a gateway id is a genuine gateway failure —
    the reconciler skips it (never even queries the gateway)."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gw_id = f"pout_{uuid.uuid4().hex[:14]}"
    payout_id = await _seed_stuck_payout(
        recipient_uid=recipient_uid,
        maker_uid=maker_uid,
        gateway_payout_id=gw_id,
        status=PayoutStatus.FAILED,
    )

    called = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        gw = request.url.path.rsplit("/", 1)[-1]
        if gw == gw_id or request.url.params.get("reference_id") == payout_id:
            called["n"] += 1  # would mean we wrongly queried this payout
        if "reference_id" in request.url.params:
            return httpx.Response(200, json={"items": []})
        return httpx.Response(200, json={"id": gw, "status": "queued"})

    _install_transport(monkeypatch, handler)

    await payments.reconcile_stuck_payouts()
    assert called["n"] == 0  # skipped before any gateway call
    assert (await _payout_row(payout_id))[0] == "failed"
    assert await _ledger_count(recipient_uid) == 0


@pytest.mark.asyncio
async def test_reconcile_skips_in_mock_mode() -> None:
    """Empty creds ⇒ mock ⇒ nothing to reconcile, returns immediately."""
    assert payments._is_live() is False
    summary = await payments.reconcile_stuck_payouts()
    assert summary["skipped"] == "mock"


# ---------------------------------------------------------------------------
# PAID-drift audit (post-settlement reversal detection)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_paid_payout_reversed_emits_clawback(client, monkeypatch) -> None:
    """A recently-PAID payout the gateway now reports as reversed gets a
    compensating negative ledger row and flips to REVERSED — same idempotent
    CAS settle_from_webhook already uses for a real webhook."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gw_id = f"pout_{uuid.uuid4().hex[:14]}"
    payout_id = await _seed_paid_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=gw_id, days_ago=1
    )

    def handler(request: httpx.Request) -> httpx.Response:
        gw = request.url.path.rsplit("/", 1)[-1]
        if gw == gw_id:
            return httpx.Response(200, json={"id": gw_id, "status": "reversed"})
        return httpx.Response(200, json={"id": gw, "status": "processed"})

    _install_transport(monkeypatch, handler)

    summary = await payments.audit_paid_payouts_for_drift()
    assert summary["reconciled"] >= 1
    assert (await _payout_row(payout_id))[0] == "reversed"
    assert await _ledger_count(recipient_uid) == 2  # original credit + clawback


@pytest.mark.asyncio
async def test_audit_paid_payout_still_processed_is_noop(client, monkeypatch) -> None:
    """A recently-PAID payout the gateway still reports as processed is left
    untouched — no drift, no extra ledger row."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gw_id = f"pout_{uuid.uuid4().hex[:14]}"
    payout_id = await _seed_paid_payout(
        recipient_uid=recipient_uid, maker_uid=maker_uid, gateway_payout_id=gw_id, days_ago=1
    )

    def handler(request: httpx.Request) -> httpx.Response:
        gw = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json={"id": gw, "status": "processed"})

    _install_transport(monkeypatch, handler)

    await payments.audit_paid_payouts_for_drift()
    assert (await _payout_row(payout_id))[0] == "paid"
    assert await _ledger_count(recipient_uid) == 1  # unchanged


@pytest.mark.asyncio
async def test_audit_paid_payout_outside_window_not_scanned(client, monkeypatch) -> None:
    """A PAID payout older than PAYOUT_REVERSAL_AUDIT_WINDOW_DAYS is never
    queried at all — the gateway isn't even asked."""
    _go_live(monkeypatch)
    _, recipient_mobile = await full_registration(client, lines=["real_estate"])
    _, maker_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    maker_uid = await _auth_user_id(maker_mobile)
    gw_id = f"pout_{uuid.uuid4().hex[:14]}"
    await _seed_paid_payout(
        recipient_uid=recipient_uid,
        maker_uid=maker_uid,
        gateway_payout_id=gw_id,
        days_ago=settings.PAYOUT_REVERSAL_AUDIT_WINDOW_DAYS + 1,
    )

    called = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(f"/payouts/{gw_id}"):
            called["n"] += 1  # would mean we wrongly queried this payout
        gw = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json={"id": gw, "status": "processed"})

    _install_transport(monkeypatch, handler)

    await payments.audit_paid_payouts_for_drift()
    assert called["n"] == 0


@pytest.mark.asyncio
async def test_audit_paid_payouts_skips_in_mock_mode() -> None:
    """Empty creds ⇒ mock ⇒ nothing to audit, returns immediately."""
    assert payments._is_live() is False
    summary = await payments.audit_paid_payouts_for_drift()
    assert summary["skipped"] == "mock"
