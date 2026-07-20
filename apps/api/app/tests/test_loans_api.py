"""GET /api/v1/loans/applications(/{id}) — HTTP-layer behavior for the client role.

RLS role/line differentiation is covered exhaustively in test_loans_rls.py; this
file covers the endpoint contract: auth required, empty-list shape, response
mapping, and 404 (not 403 — existence must not leak) on another client's row.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from conftest import full_registration, unique_mobile


async def _client_profile_uuid(mobile: str) -> str:
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
        return str(row[0])


async def _seed_loan_application(client_profile_uuid: str) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.loan import LoanApplication, LoanStatus

    async with _session_mod.AsyncSessionLocal() as db:
        loan_type = (await db.execute(text("SELECT id, label FROM loan_types LIMIT 1"))).fetchone()
        assert loan_type is not None, "loan_types seed missing — run migration 1a2b3c4d5e6f"

        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            status=LeadStatus.CONVERTED,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.flush()

        loan_application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            business_line="loans",
            loan_type_id=loan_type[0],
            status=LoanStatus.SUBMITTED_TO_BANK,
            status_reason=None,
            amount_requested=500000,
        )
        db.add(loan_application)
        await db.commit()
        return str(loan_application.id)


@pytest.mark.asyncio
async def test_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/loans/applications")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_empty_for_new_client(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        "/api/v1/loans/applications", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"applications": []}


@pytest.mark.asyncio
async def test_list_returns_own_application(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)

    resp = await client.get(
        "/api/v1/loans/applications", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["applications"]) == 1
    row = body["applications"][0]
    assert row["id"] == app_id
    assert row["status"] == "submitted_to_bank"
    assert row["amount_requested"] == "500000.00"
    assert row["loan_type"]["label"]


@pytest.mark.asyncio
async def test_list_excludes_other_clients_application(client: AsyncClient) -> None:
    """List must not leak another client's row over the real HTTP + JWT path
    (test_loans_rls.py covers this at the raw-GUC layer; this exercises the
    actual get_current_user claim -> RLS context mapping end to end)."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_cpu = await _client_profile_uuid(owner_mobile)
    await _seed_loan_application(owner_cpu)

    other_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        "/api/v1/loans/applications", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"applications": []}


@pytest.mark.asyncio
async def test_both_line_client_still_sees_loans_application(client: AsyncClient) -> None:
    """Regression guard: a dual-line client's JWT carries only ONE
    client_profile_uuid (auth_service._build_access_claims picks the loans
    profile deterministically, since ClientProfile rows are ordered by
    business_line and every self-registered client holds both lines
    regardless of what `lines` was requested). loan_applications RLS depends
    on that ordering staying loans-first; this pins the visible behavior so a
    future reordering of _build_access_claims fails a test instead of
    silently hiding every dual-line client's loan applications."""
    token, mobile = await full_registration(client, lines=["loans", "real_estate"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)

    resp = await client.get(
        "/api/v1/loans/applications", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [a["id"] for a in body["applications"]] == [app_id]


@pytest.mark.asyncio
async def test_get_own_application_by_id(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    cpu = await _client_profile_uuid(mobile)
    app_id = await _seed_loan_application(cpu)

    resp = await client.get(
        f"/api/v1/loans/applications/{app_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == app_id


@pytest.mark.asyncio
async def test_get_other_clients_application_is_404(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_cpu = await _client_profile_uuid(owner_mobile)
    app_id = await _seed_loan_application(owner_cpu)

    other_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        f"/api/v1/loans/applications/{app_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_unknown_id_is_404(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        f"/api/v1/loans/applications/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
