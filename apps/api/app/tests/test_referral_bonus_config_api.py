"""referral_bonus_config API — create, edit, guards, payout-activity oversight.

Mints role-specific access tokens (sub_admin / admin) for an already-registered
auth_user, same technique as test_offers_api.py. No approval gate, no status
machine — active is a plain toggle, so there are no lifecycle-advance endpoints
to test here, unlike offers/content_blocks.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile

_URL = "/api/v1/referral-bonus-config"


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "both", "platform_scope": "true"}
    )


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "both", "platform_scope": "true"}
    )


def _payload(**overrides) -> dict:
    base = {
        "business_line": "loans",
        "bonus_amount": "500",
        "rule": {"min_conversion": 1},
        "active": False,
    }
    base.update(overrides)
    return base


async def _create(client: AsyncClient, headers: dict, **overrides) -> dict:
    res = await client.post(_URL, json=_payload(**overrides), headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


async def _seed_referral_history(config_id: str, referrer_uuid: str) -> None:
    import app.db.session as _session_mod
    from app.models.referral import Referral

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            Referral(
                referrer_auth_user_uuid=uuid.UUID(referrer_uuid),
                referred_mobile=unique_mobile(),
                business_line="loans",
                bonus_config_uuid=uuid.UUID(config_id),
            )
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sub_admin_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    body = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(uid)}"})
    assert body["created_by_uuid"] == uid
    assert body["active"] is False


@pytest.mark.asyncio
async def test_negative_bonus_amount_is_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        _URL,
        json=_payload(bonus_amount="-5"),
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Role guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_client_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(_URL, json=_payload(), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_can_create(client: AsyncClient) -> None:
    """Admin has read-only oversight — no authoring."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        _URL, json=_payload(), headers={"Authorization": f"Bearer {_admin_token(uid)}"}
    )
    assert res.status_code == 201, res.text


@pytest.mark.asyncio
async def test_line_scoped_admin_cannot_create(client: AsyncClient) -> None:
    """CMS overrides are reserved for the cross-line platform Admin."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "admin", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(_URL, json=_payload(), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_telecaller_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(_URL, json=_payload(), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_employee_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "employee", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(_URL, json=_payload(), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_agent_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "agent", "business_line": "real_estate", "platform_scope": "false"}
    )
    res = await client.post(_URL, json=_payload(), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_can_update(client: AsyncClient) -> None:
    """Same require_sub_admin guard as create — Admin has no write path here."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    config = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"})
    _, admin_mobile = await full_registration(client, lines=["loans"])
    admin_uid = await _auth_user_uuid(admin_mobile)

    res = await client.patch(
        f"{_URL}/{config['id']}",
        json={"active": True},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["active"] is True


@pytest.mark.asyncio
async def test_admin_can_list(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(uid)}"})

    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    assert created["id"] in [c["id"] for c in res.json()["configs"]]


@pytest.mark.asyncio
async def test_telecaller_list_is_empty(client: AsyncClient) -> None:
    """RLS denial by absence — the route is reachable, the rows are not."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _create(client, {"Authorization": f"Bearer {_sub_admin_token(uid)}"})

    token = create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(_URL, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.json()["configs"] == []


# ---------------------------------------------------------------------------
# Edit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_edit_activates(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers)

    res = await client.patch(f"{_URL}/{config['id']}", json={"active": True}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["active"] is True


@pytest.mark.asyncio
async def test_edit_bonus_amount_and_rule(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers)

    res = await client.patch(
        f"{_URL}/{config['id']}",
        json={"bonus_amount": "750", "rule": {"min_conversion": 2, "cap": 5}},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["bonus_amount"] == "750"
    assert body["rule"] == {"min_conversion": 2, "cap": 5}


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["bonus_amount", "rule", "active"])
async def test_edit_rejects_null_for_non_nullable_fields(client: AsyncClient, field: str) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers)

    response = await client.patch(f"{_URL}/{config['id']}", json={field: None}, headers=headers)

    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_edit_by_non_owner_is_hidden_by_rls(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    config = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"})

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    res = await client.patch(
        f"{_URL}/{config['id']}",
        json={"active": True},
        headers={"Authorization": f"Bearer {_sub_admin_token(other_uid)}"},
    )
    assert res.status_code == 404, res.text


@pytest.mark.asyncio
async def test_business_line_is_not_editable(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers, business_line="loans")

    res = await client.patch(f"{_URL}/{config['id']}", json={"active": True}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["business_line"] == "loans"


@pytest.mark.asyncio
async def test_edit_unknown_id_is_not_found(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.patch(
        f"{_URL}/{uuid.uuid4()}",
        json={"active": True},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_detail(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers)

    res = await client.get(f"{_URL}/{config['id']}", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["id"] == config["id"]


@pytest.mark.asyncio
async def test_get_detail_unknown_id_is_not_found(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.get(
        f"{_URL}/{uuid.uuid4()}", headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_owner_can_delete_retired_unused_rule(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers, active=False)

    deleted = await client.delete(f"{_URL}/{config['id']}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    missing = await client.get(f"{_URL}/{config['id']}", headers=headers)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_active_rule_must_be_retired_before_delete(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers, active=True)

    response = await client.delete(f"{_URL}/{config['id']}", headers=headers)
    assert response.status_code == 409
    assert "Retire" in response.json()["detail"]


@pytest.mark.asyncio
async def test_rule_with_referral_history_is_retained_and_reported(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    config = await _create(client, headers, active=False)
    await _seed_referral_history(config["id"], uid)

    detail = await client.get(f"{_URL}/{config['id']}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["is_referenced"] is True

    response = await client.delete(f"{_URL}/{config['id']}", headers=headers)
    assert response.status_code == 409
    assert "history" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Payout activity (read-only oversight)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_payout_activity_lists_referral_bonus_transactions(client: AsyncClient) -> None:
    from app.models.transaction import Transaction, TransactionStatus, TransactionType

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=uuid.UUID(uid),
            business_line="loans",
            type=TransactionType.REFERRAL_BONUS,
            status=TransactionStatus.PAID,
            amount_paise=50_000,
            currency="INR",
            description="Referral payout",
        )
        db.add(txn)
        await db.commit()
        txn_id = str(txn.id)

    res = await client.get(
        f"{_URL}/payout-activity/recent",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert txn_id in [row["id"] for row in res.json()["activity"]]


@pytest.mark.asyncio
async def test_payout_activity_excludes_cashback(client: AsyncClient) -> None:
    from app.models.transaction import Transaction, TransactionStatus, TransactionType

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=uuid.UUID(uid),
            business_line="loans",
            type=TransactionType.CASHBACK,
            status=TransactionStatus.PAID,
            amount_paise=50_000,
            currency="INR",
            description="Cashback payout",
        )
        db.add(txn)
        await db.commit()
        txn_id = str(txn.id)

    res = await client.get(
        f"{_URL}/payout-activity/recent",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert txn_id not in [row["id"] for row in res.json()["activity"]]


@pytest.mark.asyncio
async def test_client_cannot_see_payout_activity(client: AsyncClient) -> None:
    """App-layer gate, not just RLS: transactions_rls's owner branch is
    unconditional on role, so without an explicit check here a plain client
    would get back their OWN referral_bonus rows from this staff-oversight
    route (not a cross-tenant leak, but a contract mismatch). Assert the
    route rejects non-staff outright rather than silently degrading to an
    empty/partial "oversight" view."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(
        f"{_URL}/payout-activity/recent", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_agent_cannot_see_payout_activity(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "agent", "business_line": "real_estate", "platform_scope": "false"}
    )
    res = await client.get(
        f"{_URL}/payout-activity/recent", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_see_payout_activity(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.get(
        f"{_URL}/payout-activity/recent",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
