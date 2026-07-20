"""Partial UNIQUE on loan_applications.client_profile_uuid — one active loan
journey per Loan profile (Client_Dashboard_System_Design.md §9 Locked #2),
enforced by migration 2b3c4d5e6f7a's `uq_loan_applications_client_profile_active`
index (`WHERE status NOT IN ('closed', 'rejected')`).

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus
from conftest import full_registration, unique_mobile


async def _client_profile_uuid(mobile: str) -> uuid.UUID:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT cp.id FROM client_profiles cp "
                    "JOIN auth_users u ON u.id = cp.auth_user_uuid "
                    "WHERE u.mobile = :m AND cp.business_line = 'loans'"
                ),
                {"m": mobile},
            )
        ).fetchone()
        assert row is not None, f"no loans client_profile for {mobile}"
        return row[0]


async def _seed_lead(client_profile_uuid: uuid.UUID) -> uuid.UUID:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            client_profile_uuid=client_profile_uuid,
            status=LeadStatus.CONVERTED,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.commit()
        return lead.id


async def _loan_type_id() -> uuid.UUID:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (await db.execute(text("SELECT id FROM loan_types LIMIT 1"))).fetchone()
        assert row is not None, "loan_types seed missing — run migration 1a2b3c4d5e6f"
        return row[0]


@pytest.mark.asyncio
async def test_second_active_application_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    loan_type_id = await _loan_type_id()

    import app.db.session as _session_mod

    lead_1 = await _seed_lead(cpu)
    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            LoanApplication(
                lead_uuid=lead_1,
                client_profile_uuid=cpu,
                business_line="loans",
                loan_type_id=loan_type_id,
                status=LoanStatus.NEW,
            )
        )
        await db.commit()

    lead_2 = await _seed_lead(cpu)
    with pytest.raises(IntegrityError):
        async with _session_mod.AsyncSessionLocal() as db:
            db.add(
                LoanApplication(
                    lead_uuid=lead_2,
                    client_profile_uuid=cpu,
                    business_line="loans",
                    loan_type_id=loan_type_id,
                    status=LoanStatus.ASSIGNED,
                )
            )
            await db.commit()


@pytest.mark.asyncio
async def test_new_application_allowed_after_previous_closed(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    loan_type_id = await _loan_type_id()

    import app.db.session as _session_mod

    lead_1 = await _seed_lead(cpu)
    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            LoanApplication(
                lead_uuid=lead_1,
                client_profile_uuid=cpu,
                business_line="loans",
                loan_type_id=loan_type_id,
                status=LoanStatus.CLOSED,
            )
        )
        await db.commit()

    # A prior CLOSED journey does not block a fresh active one.
    lead_2 = await _seed_lead(cpu)
    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            LoanApplication(
                lead_uuid=lead_2,
                client_profile_uuid=cpu,
                business_line="loans",
                loan_type_id=loan_type_id,
                status=LoanStatus.NEW,
            )
        )
        await db.commit()  # must not raise
