"""Loan application lifecycle progression — Telecaller + Admin PATCH, Admin GET list.

Covers services/loan_applications.py's state machine + terms gating via both
API surfaces, plus the client-facing notification side effect and the
terminal-status side effect on the one-active-application-per-client index.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.security import create_access_token
from app.models.audit_log import AuditAction, AuditLog
from conftest import full_registration, loan_application_payload

from .test_telecaller_api import (
    _auth_user_uuid,
    _seed_assigned_lead,
    _seed_loan_application,
    _seed_telecaller,
    _telecaller_token,
)


async def _admin_token(client: AsyncClient) -> str:
    """Mint an admin-role token for a real registered auth_user (get_current_user
    requires the sub to resolve via db.get(User, ...); role/platform_scope in the
    JWT are trusted as-is, same pattern as test_admin_agents.py's _admin_token)."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


async def _client_auth_uuid_for_application(application_id: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT u.id FROM auth_users u "
                    "JOIN client_profiles cp ON cp.auth_user_uuid = u.id "
                    "JOIN loan_applications la ON la.client_profile_uuid = cp.id "
                    "WHERE la.id = :app_id"
                ),
                {"app_id": application_id},
            )
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _unread_notification_count(auth_user_uuid: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT count(*) FROM notifications "
                    "WHERE user_uuid = :uid AND type = 'loan_status_updated'"
                ),
                {"uid": auth_user_uuid},
            )
        ).fetchone()
        return int(row[0])


async def _active_bank_id() -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM banks WHERE active = true LIMIT 1"))
        ).fetchone()
        assert row is not None, "banks seed missing — run migration d5e6f7a8b9c0"
        return str(row[0])


# ---------------------------------------------------------------------------
# Telecaller PATCH — success, terms, validation, authz
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_telecaller_advances_status_success(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "contacted"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "contacted"
    assert body["closed_at"] is None

    client_auth_uuid = await _client_auth_uuid_for_application(application_id)
    assert await _unread_notification_count(client_auth_uuid) == 1

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        audit = await db.scalar(
            select(AuditLog).where(
                AuditLog.entity_uuid == uuid.UUID(application_id),
                AuditLog.action == AuditAction.LOAN_APPLICATION_UPDATED,
            )
        )
    assert audit is not None
    assert audit.actor_uuid == uuid.UUID(auth_uuid)
    assert audit.detail == {
        "previous_status": "new",
        "status": "contacted",
        "fields": ["status"],
        "status_reason_recorded": False,
    }


@pytest.mark.asyncio
async def test_terms_only_update_emits_no_notification(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    bank_id = await _active_bank_id()

    # Advance to submitted_to_bank first (terms gate).
    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    client_auth_uuid = await _client_auth_uuid_for_application(application_id)
    assert await _unread_notification_count(client_auth_uuid) == 1

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": bank_id, "interest_rate": "8.5"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["bank_id"] == bank_id
    # Still 1 — the terms-only PATCH above must not have emitted a second one.
    assert await _unread_notification_count(client_auth_uuid) == 1

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        audit = await db.scalar(
            select(AuditLog)
            .where(
                AuditLog.entity_uuid == uuid.UUID(application_id),
                AuditLog.action == AuditAction.LOAN_APPLICATION_UPDATED,
            )
            .order_by(AuditLog.created_at.desc())
        )
    assert audit is not None
    assert audit.detail == {
        "previous_status": "submitted_to_bank",
        "status": "submitted_to_bank",
        "fields": ["bank_id", "interest_rate"],
        "status_reason_recorded": False,
    }


@pytest.mark.asyncio
async def test_fee_outcome_allowed_at_sanctioned(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    for target in ("contacted", "docs_collected", "submitted_to_bank", "sanctioned"):
        res = await client.patch(
            f"/api/v1/telecaller/loan-applications/{application_id}",
            json={"status": target},
            headers=headers,
        )
        assert res.status_code == 200, res.text

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"fee_outcome": "waived"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["fee_outcome"] == "waived"


@pytest.mark.asyncio
async def test_terms_before_submitted_to_bank_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"amount_sanctioned": "500000"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_fee_outcome_before_sanctioned_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers=headers,
    )
    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"fee_outcome": "waived"},
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_unknown_bank_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers=headers,
    )
    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": str(uuid.uuid4())},
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_backward_move_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "contacted"},
        headers=headers,
    )
    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "new"},
        headers=headers,
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_rejected_without_reason_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "rejected"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_on_hold_with_reason_then_resume(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "on_hold", "status_reason": "Awaiting salary slips"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "on_hold"

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "contacted"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "contacted"


@pytest.mark.asyncio
async def test_empty_payload_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 422


async def _disbursed_at(application_id: str) -> str | None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT disbursed_at FROM loan_applications WHERE id = :id"),
                {"id": application_id},
            )
        ).fetchone()
        assert row is not None
        return row[0]


@pytest.mark.asyncio
async def test_disbursed_at_set_once_on_first_disbursed_transition_and_survives_close(
    client: AsyncClient,
) -> None:
    """Regression for the agent-commission-entry review finding (2026-07-29):
    disbursed_at is an event marker, set once at the moment status first
    reaches DISBURSED, and must NOT be cleared or overwritten by a later
    transition to CLOSED (DISBURSED's normal next step) — commission
    eligibility depends on it staying set."""
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    assert await _disbursed_at(application_id) is None

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "disbursed"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    first_disbursed_at = await _disbursed_at(application_id)
    assert first_disbursed_at is not None

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "closed"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["closed_at"] is not None
    assert await _disbursed_at(application_id) == first_disbursed_at


@pytest.mark.asyncio
async def test_patch_on_terminal_application_rejected(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")
    headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "rejected", "status_reason": "Client withdrew"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["closed_at"] is not None

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "on_hold", "status_reason": "x"},
        headers=headers,
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_terminal_status_frees_client_to_reapply(client: AsyncClient) -> None:
    """Side effect of closing/rejecting: the partial-unique index
    (uq_loan_applications_client_profile_active, 2b3c4d5e6f7a) only blocks
    non-terminal applications — a fresh POST /applications should succeed
    once the prior one is rejected."""
    token, mobile = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    payload = await loan_application_payload(client, token)

    created = await client.post(
        "/api/v1/loans/applications",
        headers=headers,
        json=payload,
    )
    assert created.status_code == 201, created.text
    application_id = created.json()["id"]

    admin_res = await client.patch(
        f"/api/v1/admin/loan-applications/{application_id}",
        json={"status": "rejected", "status_reason": "Ineligible"},
        headers={"Authorization": f"Bearer {await _admin_token(client)}"},
    )
    assert admin_res.status_code == 200, admin_res.text

    second = await client.post(
        "/api/v1/loans/applications",
        headers=headers,
        json=payload,
    )
    assert second.status_code == 201, second.text


@pytest.mark.asyncio
async def test_authz_client_forbidden(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    _, mobile = await full_registration(client)
    client_uuid = await _auth_user_uuid(mobile)
    client_token = create_access_token(
        {"sub": client_uuid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "contacted"},
        headers={"Authorization": f"Bearer {client_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{uuid.uuid4()}",
        json={"status": "contacted"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_telecaller_not_assigned_is_404(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    _, other_staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", other_staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "contacted"},
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_non_loans_application_is_rejected_by_database(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_telecaller("real_estate")
    lead_id = await _seed_assigned_lead("real_estate", staff_uuid)
    with pytest.raises(IntegrityError, match="ck_loan_applications_business_line_fixed"):
        await _seed_loan_application(lead_id, "real_estate")


# ---------------------------------------------------------------------------
# Admin GET list + PATCH override
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_list_loans(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.get(
        "/api/v1/admin/loans",
        headers={"Authorization": f"Bearer {await _admin_token(client)}"},
    )
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "private, no-store"
    ids = [row["id"] for row in res.json()["applications"]]
    assert application_id in ids


@pytest.mark.asyncio
async def test_admin_list_loans_status_filter(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.get(
        "/api/v1/admin/loans?status_filter=new",
        headers={"Authorization": f"Bearer {await _admin_token(client)}"},
    )
    assert res.status_code == 200, res.text
    assert application_id in [row["id"] for row in res.json()["applications"]]

    res = await client.get(
        "/api/v1/admin/loans?status_filter=disbursed",
        headers={"Authorization": f"Bearer {await _admin_token(client)}"},
    )
    assert res.status_code == 200, res.text
    assert application_id not in [row["id"] for row in res.json()["applications"]]


@pytest.mark.asyncio
async def test_admin_list_forbidden_for_telecaller(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    res = await client.get(
        "/api/v1/admin/loans",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_override_application_assigned_to_other_telecaller(
    client: AsyncClient,
) -> None:
    """Admin's platform_scope bypass means it can act on ANY application, not
    just ones on its own line/assignment — the point of the override."""
    _, other_staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", other_staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/admin/loan-applications/{application_id}",
        json={"status": "contacted"},
        headers={"Authorization": f"Bearer {await _admin_token(client)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "contacted"
    assert res.json()["customer_code"]


@pytest.mark.asyncio
async def test_admin_patch_same_rules_apply(client: AsyncClient) -> None:
    _, staff_uuid = await _seed_telecaller("loans")
    lead_id = await _seed_assigned_lead("loans", staff_uuid)
    application_id = await _seed_loan_application(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/admin/loan-applications/{application_id}",
        json={"amount_sanctioned": "500000"},
        headers={"Authorization": f"Bearer {await _admin_token(client)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_admin_patch_not_found(client: AsyncClient) -> None:
    res = await client.patch(
        f"/api/v1/admin/loan-applications/{uuid.uuid4()}",
        json={"status": "contacted"},
        headers={"Authorization": f"Bearer {await _admin_token(client)}"},
    )
    assert res.status_code == 404
