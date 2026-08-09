"""Database enforcement for business-line classification and provenance."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

import app.db.session as db_session
from app.models.lead import Lead
from app.models.lead_activity import CallDisposition, LeadActivity
from app.models.payout import Payout, PayoutDestination, PayoutType
from app.models.profile import ProfileScope, StaffProfile, StaffRole
from app.models.referral import Referral, ReferralStatus
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.models.user import User


def _user() -> User:
    token = uuid.uuid4().hex
    return User(
        first_name="Line",
        last_name="Contract",
        mobile=f"+91{int(token[:10], 16) % 10_000_000_000:010d}",
        email=f"line-contract-{token}@example.com",
        password_hash="test-only",
    )


@pytest.mark.parametrize("line", [None, "both"])
async def test_operational_lead_rejects_missing_or_identity_line(line: str | None) -> None:
    async with db_session.AsyncSessionLocal() as db:
        with pytest.raises(IntegrityError):
            await db.execute(
                text(
                    "INSERT INTO leads (id, mobile, business_line) "
                    "VALUES (gen_random_uuid(), :mobile, CAST(:line AS business_line_enum))"
                ),
                {"mobile": f"+91{uuid.uuid4().int % 10_000_000_000:010d}", "line": line},
            )
            await db.flush()
        await db.rollback()


async def test_operational_line_is_immutable_after_creation() -> None:
    async with db_session.AsyncSessionLocal() as db:
        lead = Lead(mobile=f"+91{uuid.uuid4().int % 10_000_000_000:010d}", business_line="loans")
        db.add(lead)
        await db.flush()
        with pytest.raises(DBAPIError, match="business_line is immutable"):
            await db.execute(
                text("UPDATE leads SET business_line = 'real_estate' WHERE id = :lead_id"),
                {"lead_id": lead.id},
            )
        await db.rollback()


async def test_parent_child_line_mismatch_is_rejected() -> None:
    async with db_session.AsyncSessionLocal() as db:
        user = _user()
        db.add(user)
        await db.flush()
        staff = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line="real_estate",
            staff_code=f"BL-{uuid.uuid4().hex[:12]}",
        )
        lead = Lead(mobile=f"+91{uuid.uuid4().int % 10_000_000_000:010d}", business_line="loans")
        db.add_all([staff, lead])
        await db.flush()
        db.add(
            LeadActivity(
                lead_uuid=lead.id,
                telecaller_staff_profile_uuid=staff.id,
                business_line="loans",
                disposition=CallDisposition.CONNECTED,
            )
        )
        with pytest.raises(DBAPIError, match="does not match lead activity parents"):
            await db.flush()
        await db.rollback()


async def test_referral_requires_line_before_conversion() -> None:
    async with db_session.AsyncSessionLocal() as db:
        user = _user()
        db.add(user)
        await db.flush()
        referral = Referral(
            referrer_auth_user_uuid=user.id,
            referred_mobile=f"+91{uuid.uuid4().int % 10_000_000_000:010d}",
            business_line=None,
            conversion_status=ReferralStatus.PENDING,
        )
        db.add(referral)
        await db.flush()
        referral.conversion_status = ReferralStatus.ACCRUED
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


async def test_payout_rejects_cross_line_ledger_link() -> None:
    async with db_session.AsyncSessionLocal() as db:
        recipient = _user()
        maker = _user()
        db.add_all([recipient, maker])
        await db.flush()
        ledger = Transaction(
            user_uuid=recipient.id,
            business_line="real_estate",
            type=TransactionType.REFERRAL_BONUS,
            status=TransactionStatus.PAID,
            amount_paise=100,
            currency="INR",
            description="classification contract",
        )
        db.add(ledger)
        await db.flush()
        db.add(
            Payout(
                recipient_user_uuid=recipient.id,
                business_line="loans",
                type=PayoutType.REFERRAL_BONUS,
                amount_paise=100,
                currency="INR",
                destination_type=PayoutDestination.VPA,
                destination_hint="***@upi",
                idempotency_key=f"bl-{uuid.uuid4().hex}",
                maker_user_uuid=maker.id,
                ledger_transaction_id=ledger.id,
            )
        )
        with pytest.raises(DBAPIError, match="does not match payout transactions"):
            await db.flush()
        await db.rollback()
