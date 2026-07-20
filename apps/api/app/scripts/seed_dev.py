"""Populate a dev client with sample loan applications + support tickets.

Dev only. The target account's mobile is a required argument (no hardcoded
default — a real mobile number is PII and must not live in source):
    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_dev +919812345678

Inserts through AsyncSessionLocal as the `app` superuser, which bypasses RLS
(the tables are ENABLE, not FORCE), so no GUCs are needed — the same approach the
test _seed_* helpers use. Idempotent: skips a section if the client already has
rows there. Respects the partial-unique index on loan_applications
(one non-terminal application per client), seeding exactly one active row.

If the client is not registered yet, register them through the web app first
(the script no-ops with a message rather than creating an account).
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text


async def _seed(mobile: str) -> None:
    import app.db.session as session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.loan import FeeOutcome, LoanApplication, LoanStatus, LoanType
    from app.models.support_ticket import SupportCategory, SupportStatus, SupportTicket

    async with session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT u.id, cp.id FROM auth_users u "
                    "JOIN client_profiles cp ON cp.auth_user_uuid = u.id "
                    "WHERE u.mobile = :m AND cp.business_line = 'loans'"
                ),
                {"m": mobile},
            )
        ).fetchone()
        if row is None:
            print(
                f"[seed_dev] No loans client for {mobile}. Register the account first, then re-run."
            )
            return
        user_id, cpu = row[0], row[1]

        loan_types = (await db.execute(select(LoanType).order_by(LoanType.name))).scalars().all()
        if not loan_types:
            print("[seed_dev] loan_types is empty — run `alembic upgrade head` first.")
            return

        def lt(i: int) -> uuid.UUID:
            return loan_types[i % len(loan_types)].id

        now = datetime.now(UTC)

        # --- Loan applications -------------------------------------------------
        existing = await db.scalar(
            select(func.count())
            .select_from(LoanApplication)
            .where(LoanApplication.client_profile_uuid == cpu)
        )
        if existing:
            print(f"[seed_dev] {existing} loan application(s) already present — skipping loans.")
        else:
            # A synthetic, unique mobile: the client's real mobile already has an
            # active lead (captured at registration) and leads carry a partial-unique
            # on active mobiles. This lead is only an FK anchor for the applications
            # (client_profile_uuid, not the lead, is what the client sees / RLS keys on).
            seed_lead_mobile = "+9190" + str(uuid.uuid4().int)[:8]
            lead = Lead(
                mobile=seed_lead_mobile,
                business_line="loans",
                client_profile_uuid=cpu,
                status=LeadStatus.CONVERTED,
                origin=LeadOrigin.DIRECT,
            )
            db.add(lead)
            await db.flush()

            # Exactly ONE non-terminal row (disbursed) — partial-unique index allows
            # only one active application per client_profile. The rest are terminal.
            apps = [
                LoanApplication(
                    lead_uuid=lead.id,
                    client_profile_uuid=cpu,
                    business_line="loans",
                    loan_type_id=lt(2),
                    status=LoanStatus.DISBURSED,
                    amount_requested=2500000,
                    amount_sanctioned=2400000,
                    interest_rate=8.65,
                    processing_fee=12000,
                    fee_outcome=FeeOutcome.CASHBACK,
                    opened_at=now - timedelta(days=40),
                ),
                LoanApplication(
                    lead_uuid=lead.id,
                    client_profile_uuid=cpu,
                    business_line="loans",
                    loan_type_id=lt(0),
                    status=LoanStatus.CLOSED,
                    amount_requested=500000,
                    amount_sanctioned=500000,
                    interest_rate=11.5,
                    processing_fee=5000,
                    fee_outcome=FeeOutcome.WAIVED,
                    opened_at=now - timedelta(days=400),
                    closed_at=now - timedelta(days=120),
                ),
                LoanApplication(
                    lead_uuid=lead.id,
                    client_profile_uuid=cpu,
                    business_line="loans",
                    loan_type_id=lt(3),
                    status=LoanStatus.CLOSED,
                    amount_requested=800000,
                    amount_sanctioned=750000,
                    interest_rate=9.9,
                    processing_fee=7500,
                    fee_outcome=FeeOutcome.NONE_,
                    opened_at=now - timedelta(days=300),
                    closed_at=now - timedelta(days=60),
                ),
                LoanApplication(
                    lead_uuid=lead.id,
                    client_profile_uuid=cpu,
                    business_line="loans",
                    loan_type_id=lt(4),
                    status=LoanStatus.REJECTED,
                    amount_requested=1500000,
                    status_reason=(
                        "Requested amount exceeded the eligibility for the income proof provided."
                    ),
                    opened_at=now - timedelta(days=90),
                    closed_at=now - timedelta(days=80),
                ),
            ]
            db.add_all(apps)
            await db.commit()
            print(f"[seed_dev] Inserted {len(apps)} loan applications for {mobile}.")

        # --- Support tickets ---------------------------------------------------
        existing_tickets = await db.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.auth_user_uuid == user_id)
        )
        if existing_tickets:
            print(f"[seed_dev] {existing_tickets} support ticket(s) already present — skipping.")
        else:
            tickets = [
                SupportTicket(
                    auth_user_uuid=user_id,
                    category=SupportCategory.OTP,
                    subject="Did not receive the OTP call",
                    body="I tried logging in twice but never got the verification call.",
                    status=SupportStatus.RESOLVED,
                ),
                SupportTicket(
                    auth_user_uuid=user_id,
                    category=SupportCategory.GENERAL,
                    subject="Question about cashback timing",
                    body="When is the cashback on my disbursed loan credited?",
                    status=SupportStatus.IN_PROGRESS,
                ),
                SupportTicket(
                    auth_user_uuid=user_id,
                    category=SupportCategory.ACCOUNT_LOGIN,
                    subject="Password reset not working",
                    body="The reset link did not arrive on my email.",
                    status=SupportStatus.OPEN,
                ),
            ]
            db.add_all(tickets)
            await db.commit()
            print(f"[seed_dev] Inserted {len(tickets)} support tickets for {mobile}.")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m app.scripts.seed_dev <mobile-e164>   e.g. +919812345678")
        sys.exit(1)
    asyncio.run(_seed(sys.argv[1]))


if __name__ == "__main__":
    main()
