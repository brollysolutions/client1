"""Payout-linkage reconciliation job tests (feature-status.md §2 #15).

reconcile_payout_links must repair both divergence directions per payout
type (paid-but-source-row-still-unpaid, terminal-dead-but-still-linked),
respect the grace window (a divergence younger than
PAYOUT_LINK_RECONCILE_GRACE_MINUTES is left alone so the sweep never races a
settle/reject that is still mid-hook), never touch a payout that is still
in-flight (INITIATED), be idempotent, and write exactly one audit row per
sweep that actually repairs something. Requires the Docker stack;
auto-skips without Redis/Postgres.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from app.models.commission import CommissionStatus
from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
from app.models.referral import ReferralStatus
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.services.payout_links import reconcile_payout_links
from conftest import full_registration, unique_mobile

_STALE = datetime.now(UTC) - timedelta(minutes=settings.PAYOUT_LINK_RECONCILE_GRACE_MINUTES + 5)


def _within_grace() -> datetime:
    """Anchor the young divergence when the test runs, not during collection."""
    return datetime.now(UTC) - timedelta(
        minutes=max(settings.PAYOUT_LINK_RECONCILE_GRACE_MINUTES - 5, 0)
    )


async def _user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _seed_transaction(uid: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=uuid.UUID(uid),
            business_line="loans",
            type=TransactionType.CASHBACK,
            status=TransactionStatus.PAID,
            amount_paise=50_000,
            currency="INR",
            description="Payout-link reconcile fixture",
        )
        db.add(txn)
        await db.commit()
        return str(txn.id)


async def _seed_payout(
    uid: str,
    *,
    payout_type: PayoutType,
    status: PayoutStatus,
    updated_at: datetime,
    ledger_transaction_id: str | None = None,
) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(uid),
            business_line="loans",
            type=payout_type,
            amount_paise=50_000,
            currency="INR",
            status=status,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(uid),
            ledger_transaction_id=uuid.UUID(ledger_transaction_id)
            if ledger_transaction_id
            else None,
            updated_at=updated_at,
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


async def _seed_agent() -> tuple[str, str]:
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User

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
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        db.add(agent)
        await db.commit()
        return str(user.id), str(agent.id)


async def _seed_commission(
    agent_uid: str, agent_profile_uuid: str, *, status: CommissionStatus, payout_uuid: str
) -> str:
    import app.db.session as _session_mod
    from app.models.commission import Commission
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.loan import LoanApplication, LoanStatus, LoanType
    from app.models.profile import ClientProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line="loans",
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
            business_line="loans",
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([client_profile, loan_type])
        await db.flush()
        loan = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line="loans",
            loan_type_id=loan_type.id,
            amount_requested=100000,
            status=LoanStatus.DISBURSED,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
            disbursed_at=datetime.now(UTC),
        )
        db.add(loan)
        await db.flush()
        commission = Commission(
            agent_auth_user_uuid=uuid.UUID(agent_uid),
            agent_profile_uuid=uuid.UUID(agent_profile_uuid),
            business_line="loans",
            lead_uuid=lead.id,
            loan_application_uuid=loan.id,
            agreed_amount_paise=50_000,
            status=status,
            entered_by_uuid=uuid.UUID(agent_uid),
            payout_uuid=uuid.UUID(payout_uuid),
        )
        db.add(commission)
        await db.commit()
        return str(commission.id)


async def _get_commission(commission_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT status, payout_uuid, payout_txn_uuid FROM commissions WHERE id = :id"),
                {"id": commission_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


async def _seed_referral(referrer_uid: str, *, status: ReferralStatus, payout_uuid: str) -> str:
    import app.db.session as _session_mod
    from app.models.referral import Referral

    async with _session_mod.AsyncSessionLocal() as db:
        referral = Referral(
            referrer_auth_user_uuid=uuid.UUID(referrer_uid),
            referred_mobile=unique_mobile(),
            business_line="loans",
            conversion_status=status,
            bonus_amount_paise=50_000,
            reward_payout_uuid=uuid.UUID(payout_uuid),
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
                    "SELECT conversion_status, reward_payout_uuid, reward_txn_uuid "
                    "FROM referrals WHERE id = :id"
                ),
                {"id": referral_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


@pytest.mark.asyncio
async def test_reconcile_repairs_stuck_paid_commission(client: AsyncClient) -> None:
    """A PAID payout whose commission never flipped (the best-effort hook
    silently failed) must be re-driven to PAID, with payout_txn_uuid set."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)
    agent_uid, agent_profile_uuid = await _seed_agent()

    txn_id = await _seed_transaction(uid)
    payout_id = await _seed_payout(
        uid,
        payout_type=PayoutType.COMMISSION,
        status=PayoutStatus.PAID,
        updated_at=_STALE,
        ledger_transaction_id=txn_id,
    )
    commission_id = await _seed_commission(
        agent_uid, agent_profile_uuid, status=CommissionStatus.PENDING, payout_uuid=payout_id
    )

    summary = await reconcile_payout_links()

    assert summary["repaired_paid"] >= 1
    assert summary["still_diverged"] == 0
    commission = await _get_commission(commission_id)
    assert commission["status"] == "paid"
    assert str(commission["payout_txn_uuid"]) == txn_id


@pytest.mark.asyncio
async def test_reconcile_repairs_rejected_referral_release(client: AsyncClient) -> None:
    """A REJECTED payout whose referral is still linked (accrued, pointing
    at the dead payout) must be released back to accrued with both uuids
    cleared."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)

    payout_id = await _seed_payout(
        uid, payout_type=PayoutType.REFERRAL_BONUS, status=PayoutStatus.REJECTED, updated_at=_STALE
    )
    referral_id = await _seed_referral(uid, status=ReferralStatus.ACCRUED, payout_uuid=payout_id)

    summary = await reconcile_payout_links()

    assert summary["repaired_released"] >= 1
    assert summary["still_diverged"] == 0
    referral = await _get_referral(referral_id)
    assert referral["conversion_status"] == "accrued"
    assert referral["reward_payout_uuid"] is None


@pytest.mark.asyncio
async def test_reconcile_does_not_touch_healthy_pair(client: AsyncClient) -> None:
    """A commission already PAID with the matching payout_txn_uuid is not a
    divergence — the sweep must not scan or touch it."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)
    agent_uid, agent_profile_uuid = await _seed_agent()

    txn_id = await _seed_transaction(uid)
    payout_id = await _seed_payout(
        uid,
        payout_type=PayoutType.COMMISSION,
        status=PayoutStatus.PAID,
        updated_at=_STALE,
        ledger_transaction_id=txn_id,
    )
    commission_id = await _seed_commission(
        agent_uid, agent_profile_uuid, status=CommissionStatus.PENDING, payout_uuid=payout_id
    )
    # First sweep repairs it into a healthy pair.
    await reconcile_payout_links()
    before = await _get_commission(commission_id)
    assert before["status"] == "paid"

    # Second sweep must find nothing to do for this row.
    summary = await reconcile_payout_links()
    after = await _get_commission(commission_id)
    assert after == before
    assert summary["repaired_paid"] == 0
    assert summary["repaired_released"] == 0


@pytest.mark.asyncio
async def test_reconcile_respects_grace_window(client: AsyncClient) -> None:
    """A divergence younger than the grace window must be left alone — the
    sweep must never race a settle/reject that could still be mid-hook."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)
    agent_uid, agent_profile_uuid = await _seed_agent()

    txn_id = await _seed_transaction(uid)
    payout_id = await _seed_payout(
        uid,
        payout_type=PayoutType.COMMISSION,
        status=PayoutStatus.PAID,
        updated_at=_within_grace(),
        ledger_transaction_id=txn_id,
    )
    commission_id = await _seed_commission(
        agent_uid, agent_profile_uuid, status=CommissionStatus.PENDING, payout_uuid=payout_id
    )

    # The sweep is global and may repair unrelated divergence left by an earlier
    # scenario. The target row is the grace-window invariant, not the aggregate
    # work count for the whole database.
    await reconcile_payout_links()

    commission = await _get_commission(commission_id)
    assert commission["status"] == "pending"


@pytest.mark.asyncio
async def test_reconcile_never_releases_an_initiated_payout(client: AsyncClient) -> None:
    """An INITIATED payout is still in flight, not terminal-dead. Releasing
    its referral link would free a row that is about to be paid — the
    release query must never match a non-terminal status."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)

    payout_id = await _seed_payout(
        uid, payout_type=PayoutType.REFERRAL_BONUS, status=PayoutStatus.INITIATED, updated_at=_STALE
    )
    referral_id = await _seed_referral(uid, status=ReferralStatus.ACCRUED, payout_uuid=payout_id)

    summary = await reconcile_payout_links()

    assert summary["repaired_released"] == 0
    referral = await _get_referral(referral_id)
    assert str(referral["reward_payout_uuid"]) == payout_id


@pytest.mark.asyncio
async def test_reconcile_writes_one_audit_entry_when_repairing(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    uid = await _user_id(mobile)
    agent_uid, agent_profile_uuid = await _seed_agent()

    txn_id = await _seed_transaction(uid)
    payout_id = await _seed_payout(
        uid,
        payout_type=PayoutType.COMMISSION,
        status=PayoutStatus.PAID,
        updated_at=_STALE,
        ledger_transaction_id=txn_id,
    )
    await _seed_commission(
        agent_uid, agent_profile_uuid, status=CommissionStatus.PENDING, payout_uuid=payout_id
    )

    await reconcile_payout_links()

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT actor_uuid, entity_type, detail FROM audit_log "
                    "WHERE action = 'payout_link_reconciled' "
                    "AND detail -> 'repaired_paid' @> CAST(:needle AS jsonb) "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"needle": json.dumps([payout_id])},
            )
        ).fetchone()

    assert row is not None
    assert row.actor_uuid is None
    assert row.entity_type == "payout_links"


@pytest.mark.asyncio
async def test_reconcile_writes_no_audit_entry_when_nothing_repaired(client: AsyncClient) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        before = await db.scalar(
            text("SELECT count(*) FROM audit_log WHERE action = 'payout_link_reconciled'")
        )

    summary = await reconcile_payout_links()
    assert summary["repaired_paid"] == 0
    assert summary["repaired_released"] == 0

    async with _session_mod.AsyncSessionLocal() as db:
        after = await db.scalar(
            text("SELECT count(*) FROM audit_log WHERE action = 'payout_link_reconciled'")
        )
    assert after == before
