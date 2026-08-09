"""/api/v1/transactions — HTTP-layer behavior for the client role.

RLS isolation is covered in test_transactions_rls.py; this file covers the
endpoint contract: auth required, empty-list shape (the table ships empty in
production, no producers exist yet), and another client's rows stay
invisible. There is no create endpoint, so rows are seeded directly via the
superuser session (mirroring the future money-layer producer).

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from conftest import full_registration


async def _seed_transaction(user_uuid: str) -> str:
    import uuid

    import app.db.session as _session_mod
    from app.models.transaction import Transaction, TransactionStatus, TransactionType

    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=uuid.UUID(user_uuid),
            business_line="loans",
            type=TransactionType.REFERRAL_BONUS,
            status=TransactionStatus.PAID,
            amount_paise=150_000,
            currency="INR",
            description="Referral payout for Rohit S.",
        )
        db.add(txn)
        await db.commit()
        return str(txn.id)


async def _auth_user_uuid(mobile: str) -> str:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/transactions")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_empty_for_new_client(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get("/api/v1/transactions", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"transactions": []}


@pytest.mark.asyncio
async def test_seeded_transaction_appears_for_owner(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    txn_id = await _seed_transaction(uid)

    resp = await client.get("/api/v1/transactions", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    transactions = resp.json()["transactions"]
    assert [t["id"] for t in transactions] == [txn_id]
    assert transactions[0]["amount_paise"] == 150_000
    assert transactions[0]["status"] == "paid"
    assert transactions[0]["type"] == "referral_bonus"


@pytest.mark.asyncio
async def test_other_client_cannot_see_transaction(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    await _seed_transaction(owner_uid)

    other_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        "/api/v1/transactions", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"transactions": []}
