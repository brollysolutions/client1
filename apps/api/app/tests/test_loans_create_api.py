"""POST /api/v1/loans/applications + GET /api/v1/loans/loan-types.

RLS visibility for loan_applications is exhaustively covered by
test_loans_rls.py (own row, cross/same-line staff, platform_scope) against a
directly-seeded row; this file covers the create endpoint's own contract:
auth, the real loan-type picker, the lead-spine resolution, the
one-active-application 409, and the loans-membership guard.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from conftest import full_registration


async def _first_loan_type_id(client: AsyncClient, token: str) -> str:
    resp = await client.get(
        "/api/v1/loans/loan-types", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    return resp.json()["loan_types"][0]["id"]


@pytest.mark.asyncio
async def test_loan_types_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/loans/loan-types")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_loan_types_returns_seeded_labels(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get(
        "/api/v1/loans/loan-types", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    labels = {lt["label"] for lt in resp.json()["loan_types"]}
    assert "Personal Loan" in labels
    assert "Property Loan" in labels


@pytest.mark.asyncio
async def test_create_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/loans/applications",
        json={"loan_type_id": str(uuid.uuid4()), "amount_requested": "500000"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_then_appears_in_list(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    loan_type_id = await _first_loan_type_id(client, token)

    created = await client.post(
        "/api/v1/loans/applications",
        headers=headers,
        json={"loan_type_id": loan_type_id, "amount_requested": "500000"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "new"
    assert body["amount_requested"] == "500000.00"
    assert body["loan_type"]["id"] == loan_type_id

    listed = await client.get("/api/v1/loans/applications", headers=headers)
    assert [a["id"] for a in listed.json()["applications"]] == [body["id"]]


@pytest.mark.asyncio
async def test_create_resolves_a_real_lead(client: AsyncClient) -> None:
    """The application's lead_uuid must be a real, non-null leads.id — the
    lead-spine FK the whole feature exists to satisfy."""
    token, mobile = await full_registration(client, lines=["loans"])
    loan_type_id = await _first_loan_type_id(client, token)

    created = await client.post(
        "/api/v1/loans/applications",
        headers={"Authorization": f"Bearer {token}"},
        json={"loan_type_id": loan_type_id, "amount_requested": "500000"},
    )
    app_id = created.json()["id"]

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT la.lead_uuid, l.mobile, l.business_line, l.client_profile_uuid "
                    "FROM loan_applications la JOIN leads l ON l.id = la.lead_uuid "
                    "WHERE la.id = :id"
                ),
                {"id": app_id},
            )
        ).fetchone()
    assert row is not None
    assert row[0] is not None
    assert row[1] == mobile
    assert row[2] == "loans"
    assert row[3] is not None


@pytest.mark.asyncio
async def test_create_missing_loan_type_id_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.post(
        "/api/v1/loans/applications",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount_requested": "500000"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_zero_amount_is_422(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    loan_type_id = await _first_loan_type_id(client, token)
    resp = await client.post(
        "/api/v1/loans/applications",
        headers={"Authorization": f"Bearer {token}"},
        json={"loan_type_id": loan_type_id, "amount_requested": "0"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_unknown_loan_type_id_is_404(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    resp = await client.post(
        "/api/v1/loans/applications",
        headers={"Authorization": f"Bearer {token}"},
        json={"loan_type_id": str(uuid.uuid4()), "amount_requested": "500000"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_second_active_application_is_409(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    loan_type_id = await _first_loan_type_id(client, token)

    first = await client.post(
        "/api/v1/loans/applications",
        headers=headers,
        json={"loan_type_id": loan_type_id, "amount_requested": "500000"},
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/loans/applications",
        headers=headers,
        json={"loan_type_id": loan_type_id, "amount_requested": "300000"},
    )
    assert second.status_code == 409

    listed = await client.get("/api/v1/loans/applications", headers=headers)
    assert len(listed.json()["applications"]) == 1


def _crafted_token(user_id: str, *, role: str, business_line: str) -> str:
    """Craft claims full_registration can't naturally produce (e.g. a
    single-line client) to test guard branches directly, mirroring
    test_site_visits_api.py::_staff_token."""
    from app.core.security import create_access_token

    return create_access_token(
        {"sub": user_id, "role": role, "business_line": business_line, "platform_scope": "line"}
    )


@pytest.mark.asyncio
async def test_staff_cannot_create_application(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])

    async def _auth_user_id() -> str:
        import app.db.session as _session_mod

        async with _session_mod.AsyncSessionLocal() as db:
            row = (
                await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
            ).fetchone()
            return str(row[0])

    staff_token = _crafted_token(await _auth_user_id(), role="telecaller", business_line="loans")
    resp = await client.post(
        "/api/v1/loans/applications",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={"loan_type_id": str(uuid.uuid4()), "amount_requested": "500000"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_client_without_loans_profile_is_403(client: AsyncClient) -> None:
    """Every self-registered client is both-line today (register_set_password
    hardcodes it), so this claim shape can't occur through normal
    registration — craft it directly to prove the guard itself works,
    protecting the line-segregation invariant against a future single-line
    client path."""
    _, mobile = await full_registration(client, lines=["real_estate"])

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
    real_estate_only_token = _crafted_token(str(row[0]), role="client", business_line="real_estate")

    resp = await client.post(
        "/api/v1/loans/applications",
        headers={"Authorization": f"Bearer {real_estate_only_token}"},
        json={"loan_type_id": str(uuid.uuid4()), "amount_requested": "500000"},
    )
    assert resp.status_code == 403
