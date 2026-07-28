"""Retention purge job tests (SRS 5.1).

purge_delinked_financial_records must: purge a payout/transaction once
delinked_at is older than the retention window; leave a recently-delinked row
untouched; never touch a row that was never delinked, regardless of its
created_at age; respect the payouts-before-transactions delete order (a
payout's ledger_transaction_id FK has no ondelete, so deleting the referenced
transaction first would fail); unlink any referrals row that still points at
a payout/transaction about to be purged (referrals.reward_payout_uuid /
reward_txn_uuid are FKs with no ondelete either, and account_deletion.py
never touches the referrals table); and be idempotent. Requires the Docker
stack; auto-skips without Redis/Postgres.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, text

from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
from app.models.referral import Referral, ReferralStatus
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.services.retention_purge import purge_delinked_financial_records
from conftest import full_registration, unique_mobile

_OLD = datetime.now(UTC) - timedelta(days=365 * 8)  # past the 7-year default window
_FRESH = datetime.now(UTC) - timedelta(days=30)  # delinked recently, well inside the window


async def _user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _seed_transaction(uid: str, *, delinked_at: datetime | None) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=None if delinked_at else uuid.UUID(uid),
            business_line=None,
            type=TransactionType.CASHBACK,
            status=TransactionStatus.PAID,
            amount_paise=10_000,
            currency="INR",
            description="Retention purge fixture",
            retained_ref=uid if delinked_at else None,
            delinked_at=delinked_at,
        )
        db.add(txn)
        await db.commit()
        return str(txn.id)


async def _seed_payout(
    maker_uid: str, *, delinked_at: datetime | None, ledger_transaction_id: str | None = None
) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=None if delinked_at else uuid.UUID(maker_uid),
            type=PayoutType.CASHBACK,
            amount_paise=10_000,
            currency="INR",
            status=PayoutStatus.PAID,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(maker_uid),
            ledger_transaction_id=uuid.UUID(ledger_transaction_id)
            if ledger_transaction_id
            else None,
            retained_ref=maker_uid if delinked_at else None,
            delinked_at=delinked_at,
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


async def _seed_referral(
    referrer_uid: str, *, reward_payout_uuid: str | None, reward_txn_uuid: str | None
) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        referral = Referral(
            referrer_auth_user_uuid=uuid.UUID(referrer_uid),
            referred_mobile=unique_mobile(),
            conversion_status=ReferralStatus.PAID,
            bonus_amount_paise=10_000,
            reward_payout_uuid=uuid.UUID(reward_payout_uuid) if reward_payout_uuid else None,
            reward_txn_uuid=uuid.UUID(reward_txn_uuid) if reward_txn_uuid else None,
        )
        db.add(referral)
        await db.commit()
        return str(referral.id)


async def _get_referral(referral_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT reward_payout_uuid, reward_txn_uuid, bonus_amount_paise "
                    "FROM referrals WHERE id = :id"
                ),
                {"id": referral_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


async def _count_transactions(txn_id: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return (
            await db.execute(
                select(func.count()).select_from(Transaction).where(Transaction.id == txn_id)
            )
        ).scalar_one()


async def _count_payouts(payout_id: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return (
            await db.execute(select(func.count()).select_from(Payout).where(Payout.id == payout_id))
        ).scalar_one()


@pytest.mark.asyncio
async def test_purge_deletes_old_delinked_keeps_fresh_and_never_delinked(
    client: AsyncClient,
) -> None:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)

    old_txn = await _seed_transaction(uid, delinked_at=_OLD)
    fresh_txn = await _seed_transaction(uid, delinked_at=_FRESH)
    live_txn = await _seed_transaction(uid, delinked_at=None)

    summary = await purge_delinked_financial_records(retention_years=7)

    assert await _count_transactions(old_txn) == 0, "old delinked transaction not purged"
    assert await _count_transactions(fresh_txn) == 1, "fresh delinked transaction wrongly purged"
    assert await _count_transactions(live_txn) == 1, "never-delinked transaction wrongly purged"
    assert summary["transactions_purged"] >= 1


@pytest.mark.asyncio
async def test_purge_respects_payout_ledger_transaction_fk_order(client: AsyncClient) -> None:
    """A payout's ledger_transaction_id FK has no ondelete (default RESTRICT)
    — the job must delete the payout before its ledger transaction, or this
    would raise a foreign-key violation instead of purging either row."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)

    old_txn = await _seed_transaction(uid, delinked_at=_OLD)
    old_payout = await _seed_payout(uid, delinked_at=_OLD, ledger_transaction_id=old_txn)

    summary = await purge_delinked_financial_records(retention_years=7)

    assert await _count_payouts(old_payout) == 0
    assert await _count_transactions(old_txn) == 0
    assert summary["payouts_purged"] >= 1
    assert summary["transactions_purged"] >= 1


@pytest.mark.asyncio
async def test_purge_keeps_fresh_and_never_delinked_payouts(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)

    fresh_payout = await _seed_payout(uid, delinked_at=_FRESH)
    live_payout = await _seed_payout(uid, delinked_at=None)

    await purge_delinked_financial_records(retention_years=7)

    assert await _count_payouts(fresh_payout) == 1
    assert await _count_payouts(live_payout) == 1


@pytest.mark.asyncio
async def test_purge_unlinks_referral_reward_references_first(client: AsyncClient) -> None:
    """referrals.reward_payout_uuid/reward_txn_uuid are FKs with no ondelete
    and account_deletion.py never touches this table — left alone, a
    surviving referral row would block the purge with a foreign-key
    violation forever, not just reorder it. bonus_amount_paise (the
    denormalized reward amount) must survive the unlink."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)

    old_txn = await _seed_transaction(uid, delinked_at=_OLD)
    old_payout = await _seed_payout(uid, delinked_at=_OLD, ledger_transaction_id=old_txn)
    referral_id = await _seed_referral(uid, reward_payout_uuid=old_payout, reward_txn_uuid=old_txn)

    summary = await purge_delinked_financial_records(retention_years=7)

    assert await _count_payouts(old_payout) == 0
    assert await _count_transactions(old_txn) == 0
    assert summary["payouts_purged"] >= 1
    assert summary["transactions_purged"] >= 1

    referral = await _get_referral(referral_id)
    assert referral["reward_payout_uuid"] is None
    assert referral["reward_txn_uuid"] is None
    assert referral["bonus_amount_paise"] == 10_000


@pytest.mark.asyncio
async def test_purge_is_idempotent(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)
    old_txn = await _seed_transaction(uid, delinked_at=_OLD)

    first = await purge_delinked_financial_records(retention_years=7)
    assert first["transactions_purged"] >= 1
    assert await _count_transactions(old_txn) == 0

    second = await purge_delinked_financial_records(retention_years=7)  # must not error
    assert second["transactions_purged"] == 0


@pytest.mark.asyncio
async def test_purge_writes_an_audit_entry_with_the_purged_ids(client: AsyncClient) -> None:
    """The reason `audit_log` exists (migration a1c4e77b93d2). This is an
    irreversible hard DELETE, and before that table landed the only record of
    which rows were destroyed was a log line that the next rotation would take
    with it.

    actor_uuid must be NULL: a scheduler job has no human actor, and the
    audit_log_insert policy pins any non-NULL actor to the session identity, so
    a NULL one is only writable from the RLS-bypassing job session.
    """
    import app.db.session as _session_mod

    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)
    old_txn = await _seed_transaction(uid, delinked_at=_OLD)

    await purge_delinked_financial_records(retention_years=7)
    assert await _count_transactions(old_txn) == 0

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT actor_uuid, actor_role, entity_type, entity_uuid, detail "
                    "FROM audit_log WHERE action = 'retention_purged' "
                    # CAST(), not `:needle::jsonb` -- text()'s bind-param scanner
                    # reads the `::` as part of the parameter name and emits
                    # invalid SQL.
                    "AND detail -> 'transactions_purged' @> CAST(:needle AS jsonb) "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"needle": json.dumps([{"id": old_txn}])},
            )
        ).fetchone()

    assert row is not None, "purging a transaction wrote no audit entry naming it"
    assert row.actor_uuid is None, "a scheduler job must not claim a human actor"
    assert row.actor_role is None
    assert row.entity_type == "financial_records"
    # A sweep is not one record, so there is no single entity to point at.
    assert row.entity_uuid is None
    assert row.detail["retention_years"] == 7
    assert "cutoff" in row.detail


@pytest.mark.asyncio
async def test_purge_writes_no_audit_entry_when_nothing_was_purged(client: AsyncClient) -> None:
    """A daily no-op sweep must not append a row every single day — that would
    bury the entries that matter under a year of empty ones."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        before = await db.scalar(
            text("SELECT count(*) FROM audit_log WHERE action = 'retention_purged'")
        )

    summary = await purge_delinked_financial_records(retention_years=7)
    assert summary["transactions_purged"] == 0
    assert summary["payouts_purged"] == 0

    async with _session_mod.AsyncSessionLocal() as db:
        after = await db.scalar(
            text("SELECT count(*) FROM audit_log WHERE action = 'retention_purged'")
        )
    assert after == before
