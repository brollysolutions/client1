"""Telecaller API — list/detail/update leads, log calls, home summary.

Mints a telecaller access token for an already-registered auth_user (same pattern
as test_property_submissions_api.py) with a real StaffProfile id in the
staff_profile_uuid claim, since the telecaller endpoints/RLS key off it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _seed_telecaller(business_line: str = "loans") -> tuple[str, str]:
    """Create an auth_user + telecaller StaffProfile. Returns (auth_user_uuid, staff_uuid)."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _seed_assigned_lead(
    business_line: str, staff_profile_uuid: str, status: str = "assigned"
) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus(status),
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(staff_profile_uuid),
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_loan_application(lead_id: str, business_line: str = "loans") -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead
    from app.models.loan import Bank, LoanApplication, LoanType
    from app.models.profile import ClientProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id))
        assert lead is not None
        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
        await db.flush()
        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Home Loan")
        bank = Bank(name=f"Test Bank {uuid.uuid4().hex[:8]}")
        db.add_all([client_profile, loan_type, bank])
        await db.flush()
        application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            loan_type_id=loan_type.id,
            bank_id=bank.id,
            amount_requested=500000,
        )
        db.add(application)
        await db.commit()
        return str(application.id)


def _telecaller_token(
    auth_user_uuid: str, staff_profile_uuid: str, business_line: str = "loans"
) -> str:
    return create_access_token(
        {
            "sub": auth_user_uuid,
            "role": "telecaller",
            "business_line": business_line,
            "staff_profile_uuid": staff_profile_uuid,
            "platform_scope": "false",
        }
    )


@pytest.mark.asyncio
async def test_list_leads_returns_assigned(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.get(
        "/api/v1/telecaller/leads",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert lead_id in ids


@pytest.mark.asyncio
async def test_dual_line_telecaller_selects_one_lead_queue_per_request(
    client: AsyncClient,
) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("both")
    leads = {line: await _seed_assigned_lead(line, staff_uuid) for line in ("loans", "real_estate")}
    token = _telecaller_token(auth_uuid, staff_uuid, "both")

    for line in ("loans", "real_estate"):
        res = await client.get(
            "/api/v1/telecaller/leads",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Business-Line": line,
            },
        )
        assert res.status_code == 200, res.text
        ids = {row["id"] for row in res.json()}
        assert leads[line] in ids
        assert leads["real_estate" if line == "loans" else "loans"] not in ids


@pytest.mark.asyncio
async def test_get_lead_detail(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == lead_id
    assert body["activities"] == []


@pytest.mark.asyncio
async def test_get_lead_not_owned_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    _, other_staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", other_staff_uuid)

    res = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_lead_status(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.patch(
        f"/api/v1/telecaller/leads/{lead_id}",
        json={"status": "converted"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "converted"


@pytest.mark.asyncio
async def test_patch_lead_empty_payload_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.patch(
        f"/api/v1/telecaller/leads/{lead_id}",
        json={},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_log_call_activity_success(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid, status="assigned")

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "connected", "interest_level": "hot", "notes": "Very interested."},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["disposition"] == "connected"

    # First-contact bump: assigned -> working.
    detail = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert detail.json()["status"] == "working"


@pytest.mark.asyncio
async def test_log_call_activity_missing_interest_level_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "connected"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_log_call_activity_follow_up_in_past_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "no_answer", "follow_up_at": past},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_log_call_activity_for_unowned_lead_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    _, other_staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", other_staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "no_answer"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_home_summary(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid, status="assigned")
    future = (datetime.now(UTC) + timedelta(minutes=1)).isoformat()

    # Log a call with a near-future follow-up, then check counts/home shape.
    log_res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/activities",
        json={"disposition": "callback_requested", "follow_up_at": future},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert log_res.status_code == 201, log_res.text

    res = await client.get(
        "/api/v1/telecaller/home",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["counts_by_status"].get("working") == 1
    assert isinstance(body["follow_ups_due"], list)


@pytest.mark.asyncio
async def test_non_telecaller_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get("/api/v1/telecaller/leads", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.get("/api/v1/telecaller/leads")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_lead_detail_includes_loan_applications_for_loans_line(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["loan_applications"]) == 1
    assert body["loan_applications"][0]["id"] == application_id
    assert body["loan_applications"][0]["txns"] == []
    assert body["tasks"] == []


@pytest.mark.asyncio
async def test_lead_detail_empty_loan_applications_for_real_estate_line(
    client: AsyncClient,
) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("real_estate")
    lead_id = await _seed_assigned_lead("real_estate", staff_uuid)
    token = _telecaller_token(auth_uuid, staff_uuid, "real_estate")

    res = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["loan_applications"] == []


@pytest.mark.asyncio
async def test_add_loan_txn_success(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.post(
        f"/api/v1/telecaller/loan-applications/{application_id}/txn-history",
        json={
            "bank_name": "HDFC",
            "amount": "500000",
            "interest_rate": "8.5",
            "txn_date": "2026-07-01",
        },
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["bank_name"] == "HDFC"
    assert body["loan_application_uuid"] == application_id

    detail = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert len(detail.json()["loan_applications"][0]["txns"]) == 1


@pytest.mark.asyncio
async def test_add_loan_txn_for_unowned_application_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    _, other_staff_uuid = await _seed_telecaller("loans")
    other_lead_id = await _seed_assigned_lead("loans", other_staff_uuid)
    application_id = await _seed_loan_application(other_lead_id, "loans")

    res = await client.post(
        f"/api/v1/telecaller/loan-applications/{application_id}/txn-history",
        json={"bank_name": "HDFC"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_non_loans_application_is_rejected_by_database(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_telecaller("real_estate")
    lead_id = await _seed_assigned_lead("real_estate", staff_uuid)
    with pytest.raises(IntegrityError, match="ck_loan_applications_business_line_fixed"):
        await _seed_loan_application(lead_id, "real_estate")


@pytest.mark.asyncio
async def test_raise_task_success(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/tasks",
        json={"notes": "Collect salary slips", "due_at": None},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["task_type"] == "document_collection"
    assert body["status"] == "unassigned"
    assert body["notes"] == "Collect salary slips"

    detail = await client.get(
        f"/api/v1/telecaller/leads/{lead_id}",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert len(detail.json()["tasks"]) == 1


@pytest.mark.asyncio
async def test_raise_task_for_unowned_lead_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    _, other_staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", other_staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/tasks",
        json={"notes": "Collect documents"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_raise_task_notes_too_long_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)

    res = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/tasks",
        json={"notes": "x" * 1001},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422
