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
from pydantic import BaseModel, ValidationError
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_access_token
from app.schemas.commissions import CommissionPayoutRequest
from app.schemas.fee_cashbacks import FeeCashbackPayoutRequest
from app.schemas.payments import PayoutReject
from app.schemas.referrals import ReferralPayoutRequest
from app.services import payments as payments_service
from conftest import full_registration, unique_mobile


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


def _admin_token(
    user_id: str,
    *,
    role: str = "admin",
    platform_scope: str = "true",
    staff_features: list[str] | None = None,
) -> str:
    return create_access_token(
        {
            "sub": user_id,
            "role": role,
            "business_line": "",
            "platform_scope": platform_scope,
            "staff_features": staff_features or [],
        }
    )


async def _make_admin(
    client: AsyncClient,
    *,
    role: str = "admin",
    staff_features: list[str] | None = None,
) -> tuple[str, str]:
    """Register a throwaway account and return (admin_token, user_id) for it."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _admin_token(uid, role=role, staff_features=staff_features), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_body(recipient_uid: str, *, amount_paise: int = 50_000, **overrides) -> dict:
    body = {
        "recipient_user_uuid": recipient_uid,
        "type": "referral_bonus",
        "business_line": "loans",
        "amount_paise": amount_paise,
        "destination_type": "vpa",
        "destination": {"vpa": "9876543210@okhdfc"},
        "idempotency_key": uuid.uuid4().hex,
    }
    body.update(overrides)
    return body


@pytest.mark.parametrize(
    "schema",
    (ReferralPayoutRequest, CommissionPayoutRequest, FeeCashbackPayoutRequest),
)
def test_linked_payout_schemas_accept_credential_free_cheque(schema: type[BaseModel]) -> None:
    parsed = schema.model_validate({"destination_type": "cheque", "destination": {}})
    assert parsed.destination_type.value == "cheque"


def test_payout_reason_is_trimmed_and_cannot_be_blank() -> None:
    assert PayoutReject(reason="  cheque voided  ").reason == "cheque voided"
    with pytest.raises(ValidationError, match="Reason must not be blank"):
        PayoutReject(reason="   ")


async def _seed_agent(business_line: str = "loans") -> str:
    """Create an auth_user + single-line AgentProfile. Returns the auth_user_uuid.

    Unlike a self-registered client (always dual-line, see
    docs/specs/dual-line-clients.md), an Agent holds exactly one business_line
    — the only recipient kind that can actually exercise the create_payout
    business_line/recipient-profile mismatch guard.
    """
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"ag_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line=business_line,
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id)


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
    maker_token, _ = await _make_admin(
        client,
        role="sub_admin",
        staff_features=["payout_requests"],
    )
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["status"] == "pending_approval"
    assert data["provider"] == "razorpayx"
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


@pytest.mark.asyncio
async def test_create_cheque_has_no_raw_destination(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(
            recipient_uid,
            destination_type="cheque",
            destination={},
        ),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["provider"] == "manual"
    assert body["destination_type"] == "cheque"
    assert body["destination_hint"] == "Cheque — not issued"
    assert body["manual_issued_at"] is None
    assert body["manual_cleared_at"] is None


@pytest.mark.asyncio
async def test_cheque_rejects_embedded_bank_or_vpa_details(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(
            recipient_uid,
            destination_type="cheque",
            destination={"vpa": "must-not-enter-storage@bank"},
        ),
    )
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
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]
    assert created.json()["viewer_is_maker"] is True
    assert created.json()["viewer_can_approve"] is False

    checker_list = await client.get("/api/v1/payouts", headers=_headers(checker_token))
    checker_view = next(p for p in checker_list.json()["payouts"] if p["id"] == payout_id)
    assert checker_view["viewer_is_maker"] is False
    assert checker_view["viewer_can_approve"] is True

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
async def test_manual_cheque_credits_only_after_clearance(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    recipient_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(
            recipient_uid,
            amount_paise=87_650,
            destination_type="cheque",
            destination={},
        ),
    )
    payout_id = created.json()["id"]

    approved = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    before_issue = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    assert before_issue.json()["transactions"] == []

    reference = f"CHQ-{uuid.uuid4().hex[:12]}"
    issued = await client.post(
        f"/api/v1/payouts/{payout_id}/manual/issue",
        headers=_headers(checker_token),
        json={"reference": reference},
    )
    assert issued.status_code == 200, issued.text
    issued_body = issued.json()
    assert issued_body["status"] == "processing"
    assert issued_body["destination_hint"] == f"Cheque ••••{reference[-4:]}"
    assert issued_body["manual_issued_at"] is not None
    assert reference not in issued.text

    before_clear = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    assert before_clear.json()["transactions"] == []

    cleared = await client.post(
        f"/api/v1/payouts/{payout_id}/manual/clear", headers=_headers(checker_token)
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["status"] == "paid"
    assert cleared.json()["manual_cleared_at"] is not None

    ledger = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    txns = ledger.json()["transactions"]
    assert len(txns) == 1
    assert txns[0]["amount_paise"] == 87_650

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT p.manual_reference_fingerprint, t.reference "
                    "FROM payouts p JOIN transactions t ON t.id = p.ledger_transaction_id "
                    "WHERE p.id = CAST(:i AS uuid)"
                ),
                {"i": payout_id},
            )
        ).one()
        assert len(row.manual_reference_fingerprint) == 64
        assert reference not in row.manual_reference_fingerprint
        assert row.reference == f"manual:{payout_id}"
        audit_rows = (
            await db.execute(
                text(
                    "SELECT action::text, detail::text FROM audit_log "
                    "WHERE entity_uuid = CAST(:i AS uuid) "
                    "AND action::text LIKE 'payout_manual_%' ORDER BY created_at"
                ),
                {"i": payout_id},
            )
        ).all()
        assert [row[0] for row in audit_rows] == [
            "payout_manual_issued",
            "payout_manual_cleared",
        ]
        assert reference not in str(audit_rows)


@pytest.mark.asyncio
async def test_manual_cheque_failure_does_not_credit_ledger(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    recipient_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, destination_type="cheque", destination={}),
    )
    payout_id = created.json()["id"]
    await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token))
    failed = await client.post(
        f"/api/v1/payouts/{payout_id}/manual/fail",
        headers=_headers(checker_token),
        json={"reason": "Cheque voided before issuance."},
    )
    assert failed.status_code == 200, failed.text
    assert failed.json()["status"] == "failed"
    ledger = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    assert ledger.json()["transactions"] == []


@pytest.mark.asyncio
async def test_concurrent_manual_clear_emits_one_ledger_credit(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    recipient_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(
            recipient_uid,
            amount_paise=45_600,
            destination_type="cheque",
            destination={},
        ),
    )
    payout_id = created.json()["id"]
    await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token))
    await client.post(
        f"/api/v1/payouts/{payout_id}/manual/issue",
        headers=_headers(checker_token),
        json={"reference": f"CHQ-RACE-{uuid.uuid4().hex[:10]}"},
    )

    first, second = await asyncio.gather(
        client.post(f"/api/v1/payouts/{payout_id}/manual/clear", headers=_headers(checker_token)),
        client.post(f"/api/v1/payouts/{payout_id}/manual/clear", headers=_headers(checker_token)),
    )
    assert sorted((first.status_code, second.status_code)) == [200, 409]
    ledger = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    assert [row["amount_paise"] for row in ledger.json()["transactions"]] == [45_600]


@pytest.mark.asyncio
async def test_manual_cheque_reversal_is_idempotent_and_nets_to_zero(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    recipient_token, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(
            recipient_uid,
            amount_paise=12_300,
            destination_type="cheque",
            destination={},
        ),
    )
    payout_id = created.json()["id"]
    await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token))
    await client.post(
        f"/api/v1/payouts/{payout_id}/manual/issue",
        headers=_headers(checker_token),
        json={"reference": f"CHQ-{uuid.uuid4().hex[:12]}"},
    )
    await client.post(f"/api/v1/payouts/{payout_id}/manual/clear", headers=_headers(checker_token))

    reversed_resp = await client.post(
        f"/api/v1/payouts/{payout_id}/manual/reverse",
        headers=_headers(checker_token),
        json={"reason": "Cheque returned after clearance."},
    )
    assert reversed_resp.status_code == 200, reversed_resp.text
    assert reversed_resp.json()["status"] == "reversed"
    duplicate = await client.post(
        f"/api/v1/payouts/{payout_id}/manual/reverse",
        headers=_headers(checker_token),
        json={"reason": "Duplicate reversal."},
    )
    assert duplicate.status_code == 409

    ledger = await client.get("/api/v1/transactions", headers=_headers(recipient_token))
    amounts = [row["amount_paise"] for row in ledger.json()["transactions"]]
    assert sorted(amounts) == [-12_300, 12_300]
    assert sum(amounts) == 0


@pytest.mark.asyncio
async def test_manual_cheque_reference_cannot_be_reused(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    reference = f"CHQ-DUPLICATE-{uuid.uuid4().hex[:12]}"
    payout_ids: list[str] = []
    for _ in range(2):
        _, recipient_mobile = await full_registration(client, lines=["loans"])
        recipient_uid = await _auth_user_id(recipient_mobile)
        created = await client.post(
            "/api/v1/payouts",
            headers=_headers(maker_token),
            json=_create_body(recipient_uid, destination_type="cheque", destination={}),
        )
        payout_ids.append(created.json()["id"])
        await client.post(
            f"/api/v1/payouts/{created.json()['id']}/approve",
            headers=_headers(checker_token),
        )

    first = await client.post(
        f"/api/v1/payouts/{payout_ids[0]}/manual/issue",
        headers=_headers(checker_token),
        json={"reference": reference},
    )
    second = await client.post(
        f"/api/v1/payouts/{payout_ids[1]}/manual/issue",
        headers=_headers(checker_token),
        json={"reference": reference.lower()},
    )
    assert first.status_code == 200
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_sub_admin_cannot_operate_manual_cheque(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    sub_admin_token, _ = await _make_admin(client, role="sub_admin")
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)
    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, destination_type="cheque", destination={}),
    )
    payout_id = created.json()["id"]
    await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token))

    denied = await client.post(
        f"/api/v1/payouts/{payout_id}/manual/issue",
        headers=_headers(sub_admin_token),
        json={"reference": "CHQ-SUBADMIN-1001"},
    )
    assert denied.status_code == 403


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


@pytest.mark.asyncio
async def test_list_survives_a_delinked_payout(client: AsyncClient) -> None:
    """Account deletion (SRS 5.1) de-links a payout by nulling
    recipient_user_uuid rather than deleting the row (services/
    account_deletion.py). PayoutRead.recipient_user_uuid must tolerate that —
    regression for a validation crash where the schema still required a UUID."""
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    import app.db.session as _session_mod
    from app.models.payout import Payout

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            Payout.__table__.update()
            .where(Payout.id == uuid.UUID(payout_id))
            .values(recipient_user_uuid=None, retained_ref=recipient_uid)
        )
        await db.commit()

    listed = await client.get("/api/v1/payouts", headers=_headers(maker_token))
    assert listed.status_code == 200
    delinked = next(p for p in listed.json()["payouts"] if p["id"] == payout_id)
    assert delinked["recipient_user_uuid"] is None
    assert delinked["recipient_code"] is None


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


# ---------------------------------------------------------------------------
# identity enrichment (P1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_includes_recipient_identity(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )

    listed = await client.get("/api/v1/payouts", headers=_headers(maker_token))
    row = next(p for p in listed.json()["payouts"] if p["recipient_user_uuid"] == recipient_uid)
    assert row["recipient_name"] == "Test User"
    assert row["recipient_code"].startswith("CL-")


@pytest.mark.asyncio
async def test_create_response_includes_maker_name(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    assert created.json()["maker_name"] == "Test User"


@pytest.mark.asyncio
async def test_approve_response_includes_checker_name(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )
    payout_id = created.json()["id"]

    approved = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    body = approved.json()
    # Every test account is named "Test User" (conftest), so this only proves
    # the checker slot is enriched at all -- not identity distinctness, which
    # the maker != checker uuid guard (services/payments.py) already enforces.
    assert body["checker_name"] == "Test User"
    assert body["checker_user_uuid"] != body["maker_user_uuid"]


@pytest.mark.asyncio
async def test_read_never_exposes_recipient_mobile(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, destination={"vpa": "payee@okhdfc"}),
    )

    listed = await client.get("/api/v1/payouts", headers=_headers(maker_token))
    row = next(p for p in listed.json()["payouts"] if p["id"] == created.json()["id"])
    assert all("mobile" not in field for field in row)
    assert recipient_mobile not in str(row)
    assert row["destination_hint"] == "***@okhdfc"


@pytest.mark.asyncio
async def test_ungranted_sub_admin_cannot_list_payouts(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    sub_admin_token, _ = await _make_admin(client, role="sub_admin")
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    await client.post(
        "/api/v1/payouts", headers=_headers(maker_token), json=_create_body(recipient_uid)
    )

    listed = await client.get("/api/v1/payouts", headers=_headers(sub_admin_token))
    assert listed.status_code == 403


# ---------------------------------------------------------------------------
# recipient search (P2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recipient_search_by_name(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.get(
        "/api/v1/payouts/recipients", headers=_headers(admin_token), params={"q": "Test"}
    )
    assert resp.status_code == 200
    hit = next(r for r in resp.json()["recipients"] if r["auth_user_uuid"] == recipient_uid)
    assert hit["kind"] == "client"
    assert len(hit["codes"]) >= 1


@pytest.mark.asyncio
async def test_recipient_search_by_code(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT customer_code FROM client_profiles WHERE auth_user_uuid = :i"),
                {"i": recipient_uid},
            )
        ).fetchone()
        code = row[0]

    resp = await client.get(
        "/api/v1/payouts/recipients", headers=_headers(admin_token), params={"q": code}
    )
    assert resp.status_code == 200
    uuids = [r["auth_user_uuid"] for r in resp.json()["recipients"]]
    assert recipient_uid in uuids


@pytest.mark.asyncio
async def test_recipient_search_by_mobile_suffix(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.get(
        "/api/v1/payouts/recipients",
        headers=_headers(admin_token),
        params={"q": recipient_mobile[-8:]},
    )
    assert resp.status_code == 200
    uuids = [r["auth_user_uuid"] for r in resp.json()["recipients"]]
    assert recipient_uid in uuids


@pytest.mark.asyncio
async def test_recipient_search_returns_mobile_last4_only(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.get(
        "/api/v1/payouts/recipients",
        headers=_headers(admin_token),
        params={"q": recipient_mobile[-8:]},
    )
    hit = next(r for r in resp.json()["recipients"] if r["auth_user_uuid"] == recipient_uid)
    assert hit["mobile_last4"] == recipient_mobile[-4:]
    assert recipient_mobile not in resp.text


@pytest.mark.asyncio
async def test_recipient_search_excludes_self(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)

    resp = await client.get(
        "/api/v1/payouts/recipients", headers=_headers(admin_token), params={"q": "Test"}
    )
    uuids = [r["auth_user_uuid"] for r in resp.json()["recipients"]]
    assert admin_uid not in uuids


@pytest.mark.asyncio
async def test_recipient_search_excludes_suspended(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE auth_users SET status = 'suspended' WHERE id = :i"),
            {"i": recipient_uid},
        )
        await db.commit()

    resp = await client.get(
        "/api/v1/payouts/recipients",
        headers=_headers(admin_token),
        params={"q": recipient_mobile[-8:]},
    )
    uuids = [r["auth_user_uuid"] for r in resp.json()["recipients"]]
    assert recipient_uid not in uuids


@pytest.mark.asyncio
async def test_recipient_search_rejects_sub_admin(client: AsyncClient) -> None:
    sub_admin_token, _ = await _make_admin(client, role="sub_admin")
    resp = await client.get(
        "/api/v1/payouts/recipients", headers=_headers(sub_admin_token), params={"q": "Test"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_recipient_search_rejects_client_and_anon(client: AsyncClient) -> None:
    client_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        "/api/v1/payouts/recipients", headers=_headers(client_token), params={"q": "Test"}
    )
    assert resp.status_code == 403

    anon = await client.get("/api/v1/payouts/recipients", params={"q": "Test"})
    assert anon.status_code == 401


@pytest.mark.asyncio
async def test_recipient_search_min_query_length(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    resp = await client.get(
        "/api/v1/payouts/recipients", headers=_headers(admin_token), params={"q": "a"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_recipient_search_honours_limit(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    await full_registration(client, lines=["loans"])
    await full_registration(client, lines=["loans"])

    resp = await client.get(
        "/api/v1/payouts/recipients",
        headers=_headers(admin_token),
        params={"q": "Test", "limit": 1},
    )
    assert len(resp.json()["recipients"]) == 1


@pytest.mark.asyncio
async def test_recipient_search_wildcard_chars_are_literal(client: AsyncClient) -> None:
    """A literal `%`/`_` in the query must not act as an ILIKE wildcard."""
    admin_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    resp = await client.get(
        "/api/v1/payouts/recipients",
        headers=_headers(admin_token),
        params={"q": "Test%_zzz_not_a_real_name"},
    )
    assert resp.status_code == 200
    uuids = [r["auth_user_uuid"] for r in resp.json()["recipients"]]
    assert recipient_uid not in uuids


# ---------------------------------------------------------------------------
# business_line / recipient-profile mismatch guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rejects_business_line_recipient_mismatch(client: AsyncClient) -> None:
    """A loans-only Agent cannot receive a real_estate-tagged commission payout.

    A self-registered CLIENT is always dual-line (docs/specs/dual-line-clients.md),
    so only a single-line recipient (Agent/Staff) can exercise this guard.
    """
    maker_token, _ = await _make_admin(client)
    agent_uid = await _seed_agent(business_line="loans")

    resp = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(agent_uid, type="commission", business_line="real_estate"),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_accepts_matching_business_line(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    agent_uid = await _seed_agent(business_line="loans")

    resp = await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(agent_uid, type="commission", business_line="loans"),
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_list_shows_distinct_recipient_code_per_payout_line(client: AsyncClient) -> None:
    """Same recipient, two payouts tagged with different lines in one list response:
    each payout's recipient_code must reflect its OWN business_line, not whichever
    payout happened to be resolved last (the prefer_line cross-contamination bug)."""
    maker_token, _ = await _make_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans", "real_estate"])
    recipient_uid = await _auth_user_id(recipient_mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text(
                    "SELECT business_line, customer_code FROM client_profiles "
                    "WHERE auth_user_uuid = :i"
                ),
                {"i": recipient_uid},
            )
        ).fetchall()
    codes_by_line = {str(r[0]): r[1] for r in rows}
    assert set(codes_by_line) == {"loans", "real_estate"}

    await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(recipient_uid, business_line="loans", idempotency_key=uuid.uuid4().hex),
    )
    await client.post(
        "/api/v1/payouts",
        headers=_headers(maker_token),
        json=_create_body(
            recipient_uid, business_line="real_estate", idempotency_key=uuid.uuid4().hex
        ),
    )

    listed = await client.get("/api/v1/payouts", headers=_headers(maker_token))
    rows_by_line = {
        p["business_line"]: p
        for p in listed.json()["payouts"]
        if p["recipient_user_uuid"] == recipient_uid
    }
    assert rows_by_line["loans"]["recipient_code"] == codes_by_line["loans"]
    assert rows_by_line["real_estate"]["recipient_code"] == codes_by_line["real_estate"]
