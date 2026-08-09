"""GET /api/v1/referrals/admin + POST /api/v1/referrals/{id}/payout — Admin
oversight and payout execution (PR 2). Covers role gating (FR-9.5: Sub Admin
manages bonus rules only, never referral activity), PII masking, the
amount/recipient-from-the-row invariant, the accrued<->paid<->failed state
machine driven off services.payments, and the FR-9.4 acceptance moment (a
settled referral bonus lands in the referrer's own transaction ledger).

Runs in mock payment mode (no RAZORPAY_* creds), same as test_payouts_api.py:
approve settles to paid locally and emits the client ledger row without a
webhook.
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
from conftest import full_registration, unique_mobile


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
    """Register a throwaway account and return (admin_token, user_id) for it."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _token(uid, role="admin"), uid


async def _make_referrer(client: AsyncClient) -> str:
    """A plain client account, distinct from any admin actor in the same test —
    create_payout forbids maker == recipient (SelfPayoutForbidden), so the
    referrer seeded into a referrals row must never be the same identity as
    the admin token used to call POST /payout."""
    _, mobile = await full_registration(client, lines=["loans"])
    return await _auth_user_id(mobile)


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _payout_body(**overrides) -> dict:
    # No idempotency_key: the router derives one deterministically from the
    # referral id (review fix — a client-chosen key let two concurrent
    # creates for the same referral both slip past the dedupe guard).
    body = {
        "destination_type": "vpa",
        "destination": {"vpa": "9876543210@okhdfc"},
    }
    body.update(overrides)
    return body


async def _seed_referral(
    referrer_uuid: str,
    *,
    status: str = "accrued",
    amount_paise: int | None = 50_000,
    business_line: str | None = "loans",
    reward_payout_uuid: str | None = None,
) -> str:
    """Writes a referrals row directly, skipping the whole
    attribute_signup -> record_conversion pipeline: these tests are about the
    Admin execution surface, not accrual mechanics (covered by
    test_referral_conversion.py)."""
    import app.db.session as _session_mod
    from app.models.referral import Referral, ReferralStatus

    async with _session_mod.AsyncSessionLocal() as db:
        row = Referral(
            referrer_auth_user_uuid=uuid.UUID(referrer_uuid),
            referred_mobile=unique_mobile(),
            business_line=business_line,
            conversion_status=ReferralStatus(status),
            bonus_amount_paise=amount_paise,
            accrual_reason="accrued" if status == "accrued" else None,
            reward_payout_uuid=uuid.UUID(reward_payout_uuid) if reward_payout_uuid else None,
        )
        db.add(row)
        await db.commit()
        return str(row.id)


async def _seed_dummy_payout(recipient_uuid: str, maker_uuid: str) -> str:
    """A minimal, valid payouts row — reward_payout_uuid is a real FK, so
    test_pay_bonus_guards_already_linked needs an actual payout to point at,
    not a bare random uuid."""
    import app.db.session as _session_mod
    from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uuid),
            business_line="loans",
            type=PayoutType.REFERRAL_BONUS,
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


async def _get_referral_row(referral_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT conversion_status, reward_payout_uuid, reward_txn_uuid, "
                    "bonus_amount_paise FROM referrals WHERE id = :id"
                ),
                {"id": referral_id},
            )
        ).fetchone()
        assert row is not None
        return {
            "conversion_status": row[0],
            "reward_payout_uuid": row[1],
            "reward_txn_uuid": row[2],
            "bonus_amount_paise": row[3],
        }


# ---------------------------------------------------------------------------
# GET /admin — role gating + PII
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_list_visible_only_to_admin(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    referral_id = await _seed_referral(admin_uid)

    res = await client.get("/api/v1/referrals/admin", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    ids = [r["id"] for r in res.json()["referrals"]]
    assert referral_id in ids


@pytest.mark.asyncio
async def test_sub_admin_forbidden_from_admin_list(client: AsyncClient) -> None:
    """FR-9.5: Sub Admin manages bonus rules only, never referral activity."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    token = _token(uid, role="sub_admin")

    res = await client.get("/api/v1/referrals/admin", headers=_headers(token))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_telecaller_forbidden_from_admin_list(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    token = _token(uid, role="telecaller")

    res = await client.get("/api/v1/referrals/admin", headers=_headers(token))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_client_forbidden_from_admin_list(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    res = await client.get("/api/v1/referrals/admin", headers=_headers(token))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_list_never_leaks_raw_mobile(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    referral_id = await _seed_referral(admin_uid)

    row = await _get_referral_row(referral_id)
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        raw = (
            await db.execute(
                text("SELECT referred_mobile FROM referrals WHERE id = :id"), {"id": referral_id}
            )
        ).fetchone()[0]

    res = await client.get("/api/v1/referrals/admin", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    assert raw not in res.text
    assert row["bonus_amount_paise"] == 50_000


# ---------------------------------------------------------------------------
# POST /{id}/payout — happy path, guards, amount-from-row invariant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pay_bonus_happy_path(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 201, res.text
    payout_id = res.json()["payout_id"]

    row = await _get_referral_row(referral_id)
    assert row["conversion_status"] == "accrued"  # not yet paid — only approve settles it
    assert str(row["reward_payout_uuid"]) == payout_id

    import app.db.session as _session_mod
    from app.models.payout import Payout

    async with _session_mod.AsyncSessionLocal() as db:
        p = await db.get(Payout, uuid.UUID(payout_id))
        assert p.status.value == "pending_approval"
        assert p.amount_paise == 50_000
        assert p.type.value == "referral_bonus"
        assert p.recipient_user_uuid == uuid.UUID(referrer_uid)
        assert p.maker_user_uuid == uuid.UUID(admin_uid)


@pytest.mark.asyncio
async def test_amount_and_recipient_come_from_referral_not_body(client: AsyncClient) -> None:
    """The request body carries no amount/recipient field at all — this test
    exists to pin that contract: even if a client tried to smuggle one in via
    an unexpected key, the created payout still matches the referral row."""
    admin_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=12_345)

    res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(amount_paise=999_999_999, recipient_user_uuid=str(uuid.uuid4())),
    )
    assert res.status_code == 201, res.text
    payout_id = res.json()["payout_id"]

    import app.db.session as _session_mod
    from app.models.payout import Payout

    async with _session_mod.AsyncSessionLocal() as db:
        p = await db.get(Payout, uuid.UUID(payout_id))
        assert p.amount_paise == 12_345
        assert p.recipient_user_uuid == uuid.UUID(referrer_uid)


@pytest.mark.asyncio
async def test_pay_bonus_guards_non_accrued_status(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    for status in ("pending", "converted", "void", "paid"):
        referral_id = await _seed_referral(referrer_uid, status=status, amount_paise=50_000)
        res = await client.post(
            f"/api/v1/referrals/{referral_id}/payout",
            headers=_headers(admin_token),
            json=_payout_body(),
        )
        assert res.status_code == 409, f"status={status}: {res.text}"


@pytest.mark.asyncio
async def test_pay_bonus_guards_already_linked(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    existing_payout_id = await _seed_dummy_payout(referrer_uid, admin_uid)
    referral_id = await _seed_referral(
        referrer_uid, amount_paise=50_000, reward_payout_uuid=existing_payout_id
    )
    res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_pay_bonus_unknown_referral_404s(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.post(
        f"/api/v1/referrals/{uuid.uuid4()}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_pay_bonus_non_admin_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    sub_admin_token = _token(await _auth_user_id(mobile), role="sub_admin")
    admin_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(sub_admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 403
    # sanity: an actual admin can (proves the referral itself was seeded fine)
    res2 = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res2.status_code == 201


@pytest.mark.asyncio
async def test_pay_bonus_respects_per_payout_cap(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PAYOUT_MAX_AMOUNT_PAISE", 10_000)
    admin_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(admin_token),
        json=_payout_body(),
    )
    assert res.status_code == 422

    row = await _get_referral_row(referral_id)
    assert row["conversion_status"] == "accrued"
    assert row["reward_payout_uuid"] is None  # the rejected create never got linked


# ---------------------------------------------------------------------------
# Settlement — accrued -> paid, and the FR-9.4 acceptance moment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_settlement_flips_referral_to_paid_and_credits_referrer(
    client: AsyncClient,
) -> None:
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000, business_line="loans")

    create_res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert create_res.status_code == 201, create_res.text
    payout_id = create_res.json()["payout_id"]

    approve_res = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approve_res.status_code == 200, approve_res.text  # mock mode settles synchronously

    row = await _get_referral_row(referral_id)
    assert row["conversion_status"] == "paid"
    assert row["reward_txn_uuid"] is not None

    # FR-9.4: the reward lands in the referrer's OWN transaction history.
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        txn = (
            await db.execute(
                text(
                    "SELECT user_uuid, type, amount_paise, description FROM transactions "
                    "WHERE id = :id"
                ),
                {"id": str(row["reward_txn_uuid"])},
            )
        ).fetchone()
    assert txn is not None
    assert str(txn[0]) == referrer_uid
    assert txn[1] == "referral_bonus"
    assert txn[2] == 50_000
    assert txn[3] == "Referral bonus payout"


@pytest.mark.asyncio
async def test_mark_paid_is_idempotent(client: AsyncClient) -> None:
    """Two settle calls for the same payout must never double-flip or double-credit."""
    from app.services import referrals as referrals_service

    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    create_res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]
    await client.post(f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token))

    row_after_first = await _get_referral_row(referral_id)
    assert row_after_first["conversion_status"] == "paid"
    first_txn = row_after_first["reward_txn_uuid"]

    # Second call with a different transaction id must be a no-op (the CAS in
    # mark_paid_from_payout only matches conversion_status='accrued').
    await referrals_service.mark_paid_from_payout(
        payout_id=uuid.UUID(payout_id), transaction_id=uuid.uuid4()
    )
    row_after_second = await _get_referral_row(referral_id)
    assert row_after_second["reward_txn_uuid"] == first_txn


@pytest.mark.asyncio
async def test_rejected_payout_releases_referral_for_retry(client: AsyncClient) -> None:
    maker_token, _ = await _make_admin(client)
    rejector_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    create_res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
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

    row = await _get_referral_row(referral_id)
    assert row["conversion_status"] == "accrued"
    assert row["reward_payout_uuid"] is None
    assert row["reward_txn_uuid"] is None

    # Payable again: a second payout create succeeds against the same referral.
    retry_res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert retry_res.status_code == 201, retry_res.text


# ---------------------------------------------------------------------------
# Review fixes (2026-07-27): deterministic idempotency key closes the
# concurrent-create orphan-payout race; sub_admin barred from rejecting a
# referral_bonus payout; a reversal after settlement frees the referral again.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_pay_bonus_creates_no_orphan_payout(client: AsyncClient) -> None:
    """Two simultaneous 'Pay bonus' calls for the SAME referral must never
    both succeed. Before the deterministic per-referral idempotency key, the
    loser still left a live, unlinked pending_approval payout behind — this
    asserts exactly one payout row exists for the referrer afterward, not
    just that one HTTP call 409s."""
    admin_token, admin_uid = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    results = await asyncio.gather(
        client.post(
            f"/api/v1/referrals/{referral_id}/payout",
            headers=_headers(admin_token),
            json=_payout_body(),
        ),
        client.post(
            f"/api/v1/referrals/{referral_id}/payout",
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
                    "AND type = 'referral_bonus'"
                ),
                {"uid": referrer_uid},
            )
        ).scalar()
    assert count == 1

    row = await _get_referral_row(referral_id)
    assert row["reward_payout_uuid"] is not None


@pytest.mark.asyncio
async def test_sub_admin_cannot_reject_referral_bonus_payout(client: AsyncClient) -> None:
    """FR-9.5 side door: rejecting a referral_bonus payout runs
    services.referrals.release_payout_link on the bypass session — the
    generic _require_platform_admin gate on /payouts/{id}/reject would
    otherwise let a Sub Admin write to referrals_rls-protected state that
    they have no direct access to."""
    maker_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    create_res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
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
    row = await _get_referral_row(referral_id)
    assert row["conversion_status"] == "accrued"
    assert row["reward_payout_uuid"] is None


@pytest.mark.asyncio
async def test_reversal_after_paid_frees_referral_for_retry(client: AsyncClient) -> None:
    """The one backward edge in the state machine: a payout that settled to
    paid and was later reversed by the gateway must free the referral again,
    not leave it permanently stuck 'paid' with no money actually delivered."""
    maker_token, _ = await _make_admin(client)
    checker_token, _ = await _make_admin(client)
    referrer_uid = await _make_referrer(client)
    referral_id = await _seed_referral(referrer_uid, amount_paise=50_000)

    create_res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    payout_id = create_res.json()["payout_id"]
    approve_res = await client.post(
        f"/api/v1/payouts/{payout_id}/approve", headers=_headers(checker_token)
    )
    assert approve_res.status_code == 200, approve_res.text

    paid_row = await _get_referral_row(referral_id)
    assert paid_row["conversion_status"] == "paid"

    import app.db.session as _session_mod
    from app.models.payout import Payout

    async with _session_mod.AsyncSessionLocal() as db:
        payout = await db.get(Payout, uuid.UUID(payout_id))
        gateway_payout_id = payout.gateway_payout_id
    assert gateway_payout_id is not None

    await payments_service.settle_from_webhook(
        event="payout.reversed", gateway_payout_id=gateway_payout_id
    )

    row = await _get_referral_row(referral_id)
    assert row["conversion_status"] == "accrued"
    assert row["reward_payout_uuid"] is None
    assert row["reward_txn_uuid"] is None

    # Payable again.
    retry_res = await client.post(
        f"/api/v1/referrals/{referral_id}/payout",
        headers=_headers(maker_token),
        json=_payout_body(),
    )
    assert retry_res.status_code == 201, retry_res.text


@pytest.mark.asyncio
async def test_admin_list_rejects_invalid_business_line(client: AsyncClient) -> None:
    """business_line is now a validated Literal, not a bare str passed
    straight to an enum-typed column — an invalid value must 422, not 500."""
    admin_token, _ = await _make_admin(client)
    res = await client.get(
        "/api/v1/referrals/admin?business_line=garbage", headers=_headers(admin_token)
    )
    assert res.status_code == 422
