"""FR-2.8 creator ownership across Agent, Client, Telecaller, and Admin paths."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core.security import create_access_token
from app.models.audit_log import AuditAction, AuditLog
from app.models.lead import Lead, LeadStatus
from app.models.profile import ClientProfile
from app.models.user import User
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        return str(await db.scalar(select(User.id).where(User.mobile == mobile)))


async def _seed_agent() -> tuple[str, str]:
    import app.db.session as session_module
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User

    async with session_module.AsyncSessionLocal() as db:
        user = User(
            first_name="Ownership",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"ownership_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


def _agent_token(user_uuid: str, profile_uuid: str) -> str:
    return create_access_token(
        {
            "sub": user_uuid,
            "role": "agent",
            "business_line": "loans",
            "agent_profile_uuid": profile_uuid,
            "platform_scope": "false",
        }
    )


def _admin_token(user_uuid: str) -> str:
    return create_access_token(
        {"sub": user_uuid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


@pytest.mark.asyncio
async def test_client_edits_own_journey_details(client: AsyncClient) -> None:
    token, _mobile = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}

    before = await client.get("/api/v1/client/lead-details/loans", headers=headers)
    assert before.status_code == 200, before.text
    assert before.headers["cache-control"] == "private, no-store"
    assert set(before.json()["editable_fields"]) == {"name", "requirement.notes"}

    updated = await client.patch(
        "/api/v1/client/lead-details/loans",
        json={"name": "Client Corrected", "notes": "Need a smaller EMI."},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.headers["cache-control"] == "private, no-store"
    assert updated.json()["name"] == "Client Corrected"
    assert updated.json()["requirement"] == {"notes": "Need a smaller EMI."}
    assert updated.json()["field_owners"]["requirement.notes"] == "client"


@pytest.mark.asyncio
async def test_client_cannot_overwrite_agent_supplied_details(client: AsyncClient) -> None:
    agent_user, agent_profile = await _seed_agent()
    agent_headers = {"Authorization": f"Bearer {_agent_token(agent_user, agent_profile)}"}
    mobile = unique_mobile()
    created = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "Agent Supplied", "requirement": {"notes": "Agent note"}},
        headers=agent_headers,
    )
    assert created.status_code == 201, created.text

    client_token, _ = await full_registration(client, mobile=mobile, lines=["loans"])
    client_headers = {"Authorization": f"Bearer {client_token}"}
    details = await client.get("/api/v1/client/lead-details/loans", headers=client_headers)
    assert details.status_code == 200, details.text
    assert details.json()["field_owners"]["name"] == "agent"
    assert details.json()["editable_fields"] == []

    unchanged = await client.patch(
        "/api/v1/client/lead-details/loans",
        json={"name": "Agent Supplied"},
        headers=client_headers,
    )
    assert unchanged.status_code == 200

    denied = await client.patch(
        "/api/v1/client/lead-details/loans",
        json={"notes": "Client overwrite"},
        headers=client_headers,
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_public_capture_cannot_overwrite_agent_owned_details(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.leads as leads_service

    async def no_assignment(*_args, **_kwargs):
        return None

    monkeypatch.setattr(leads_service, "auto_assign_locked_lead", no_assignment)
    agent_user, agent_profile = await _seed_agent()
    mobile = unique_mobile()
    created = await client.post(
        "/api/v1/agent/leads",
        json={
            "mobile": mobile,
            "name": "Agent Supplied",
            "requirement": {"message": "Agent message"},
        },
        headers={"Authorization": f"Bearer {_agent_token(agent_user, agent_profile)}"},
    )
    assert created.status_code == 201, created.text

    public = await client.post(
        "/api/v1/leads",
        json={
            "mobile": mobile,
            "name": "Public overwrite",
            "topic": "loans",
            "origin": "contact",
            "message": "Public overwrite",
        },
    )
    assert public.status_code == 202, public.text

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(created.json()["id"]))
        assert lead is not None
        assert lead.name == "Agent Supplied"
        assert lead.requirement["message"] == "Agent message"
        assert lead.detail_ownership["name"]["role"] == "agent"
        assert lead.detail_ownership["requirement.message"]["role"] == "agent"


@pytest.mark.asyncio
async def test_agent_retry_preserves_system_owned_requirement(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.leads as leads_service

    async def no_assignment(*_args, **_kwargs):
        return None

    monkeypatch.setattr(leads_service, "auto_assign_locked_lead", no_assignment)
    agent_user, agent_profile = await _seed_agent()
    headers = {"Authorization": f"Bearer {_agent_token(agent_user, agent_profile)}"}
    mobile = unique_mobile()
    created = await client.post(
        "/api/v1/agent/leads",
        json={
            "mobile": mobile,
            "requirement": {"product": "Original product", "notes": "Original notes"},
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text

    retried = await client.post(
        "/api/v1/agent/leads",
        json={
            "mobile": mobile,
            "requirement": {"product": "Overwrite", "notes": "Updated notes"},
        },
        headers=headers,
    )
    assert retried.status_code == 201, retried.text

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(created.json()["id"]))
        assert lead is not None
        assert lead.requirement["product"] == "Original product"
        assert lead.requirement["notes"] == "Updated notes"
        assert lead.detail_ownership["requirement.product"]["role"] == "system"
        assert lead.detail_ownership["requirement.notes"]["role"] == "agent"


@pytest.mark.asyncio
async def test_agent_claim_transfers_unclaimed_but_preserves_system_metadata(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.leads as leads_service

    async def no_assignment(*_args, **_kwargs):
        return None

    monkeypatch.setattr(leads_service, "auto_assign_locked_lead", no_assignment)
    mobile = unique_mobile()
    public = await client.post(
        "/api/v1/leads",
        json={
            "mobile": mobile,
            "name": "Public name",
            "topic": "loans",
            "origin": "contact",
            "message": "Public message",
        },
    )
    assert public.status_code == 202, public.text

    agent_user, agent_profile = await _seed_agent()
    claimed = await client.post(
        "/api/v1/agent/leads",
        json={
            "mobile": mobile,
            "name": "Agent name",
            "requirement": {"page": "overwrite", "message": "Agent message"},
        },
        headers={"Authorization": f"Bearer {_agent_token(agent_user, agent_profile)}"},
    )
    assert claimed.status_code == 201, claimed.text

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(claimed.json()["id"]))
        assert lead is not None
        assert lead.name == "Agent name"
        assert lead.requirement["page"] == "contact"
        assert lead.requirement["message"] == "Agent message"
        assert lead.detail_ownership["name"]["role"] == "agent"
        assert lead.detail_ownership["requirement.page"]["role"] == "system"
        assert lead.detail_ownership["requirement.message"]["role"] == "agent"


@pytest.mark.asyncio
async def test_client_binding_claims_newly_supplied_name(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.leads as leads_service

    async def no_assignment(*_args, **_kwargs):
        return None

    monkeypatch.setattr(leads_service, "auto_assign_locked_lead", no_assignment)
    mobile = unique_mobile()

    import app.db.session as session_module
    from app.models.lead import LeadOrigin

    async with session_module.AsyncSessionLocal() as db:
        db.add(
            Lead(
                mobile=mobile,
                business_line="loans",
                origin=LeadOrigin.DIRECT,
                status=LeadStatus.NEW,
                name=None,
                detail_ownership={},
            )
        )
        await db.commit()

    token, _ = await full_registration(client, mobile=mobile, lines=["loans"])
    details = await client.get(
        "/api/v1/client/lead-details/loans",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert details.status_code == 200, details.text
    assert details.json()["name"]
    assert details.json()["field_owners"]["name"] == "client"


@pytest.mark.asyncio
async def test_agent_can_edit_assigned_but_not_working_lead(client: AsyncClient) -> None:
    import app.db.session as session_module

    agent_user, agent_profile = await _seed_agent()
    headers = {"Authorization": f"Bearer {_agent_token(agent_user, agent_profile)}"}
    created = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": unique_mobile(), "name": "Before", "requirement": {"notes": "Initial"}},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    lead_id = created.json()["id"]

    async with session_module.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id))
        lead.status = LeadStatus.ASSIGNED
        await db.commit()

    assigned = await client.patch(
        f"/api/v1/agent/leads/{lead_id}",
        json={"requirement": {"notes": "Still mine"}},
        headers=headers,
    )
    assert assigned.status_code == 200, assigned.text

    async with session_module.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id))
        lead.status = LeadStatus.WORKING
        await db.commit()

    locked = await client.patch(
        f"/api/v1/agent/leads/{lead_id}",
        json={"requirement": {"notes": "Too late"}},
        headers=headers,
    )
    assert locked.status_code == 409


@pytest.mark.asyncio
async def test_admin_correction_is_audited_without_values(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    details = await client.get(
        "/api/v1/client/lead-details/loans",
        headers={"Authorization": f"Bearer {token}"},
    )
    lead_id = details.json()["id"]
    user_uuid = await _auth_user_uuid(mobile)

    blank_reason = await client.patch(
        f"/api/v1/admin/leads/{lead_id}/details",
        json={"name": "Admin Corrected", "reason": "   "},
        headers={"Authorization": f"Bearer {_admin_token(user_uuid)}"},
    )
    assert blank_reason.status_code == 422

    corrected = await client.patch(
        f"/api/v1/admin/leads/{lead_id}/details",
        json={"name": "Admin Corrected", "reason": "Verified correction request"},
        headers={"Authorization": f"Bearer {_admin_token(user_uuid)}"},
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.headers["cache-control"] == "private, no-store"
    assert corrected.json()["field_owners"]["name"] == "client"

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        audit = await db.scalar(
            select(AuditLog).where(
                AuditLog.entity_uuid == uuid.UUID(lead_id),
                AuditLog.action == AuditAction.LEAD_DETAILS_UPDATED,
            )
        )
        assert audit is not None
        assert audit.detail == {
            "fields": ["name"],
            "reason": "Verified correction request",
        }


@pytest.mark.asyncio
async def test_journey_detail_routes_reject_wrong_role_and_unheld_line(
    client: AsyncClient,
) -> None:
    client_token, _mobile = await full_registration(client, lines=["loans"])
    client_headers = {"Authorization": f"Bearer {client_token}"}

    wrong_line = await client.get(
        "/api/v1/client/lead-details/real_estate",
        headers=client_headers,
    )
    assert wrong_line.status_code == 404

    loans = await client.get("/api/v1/client/lead-details/loans", headers=client_headers)
    admin_denied = await client.get(
        f"/api/v1/admin/leads/{loans.json()['id']}/details",
        headers=client_headers,
    )
    assert admin_denied.status_code == 403

    agent_user, agent_profile = await _seed_agent()
    client_route_denied = await client.get(
        "/api/v1/client/lead-details/loans",
        headers={"Authorization": f"Bearer {_agent_token(agent_user, agent_profile)}"},
    )
    assert client_route_denied.status_code == 403


@pytest.mark.asyncio
async def test_database_trigger_rejects_employee_contact_overwrite(client: AsyncClient) -> None:
    token, _mobile = await full_registration(client, lines=["loans"])
    details = await client.get(
        "/api/v1/client/lead-details/loans",
        headers={"Authorization": f"Bearer {token}"},
    )
    lead_id = details.json()["id"]

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL ROLE api_user"))
        await db.execute(
            text(
                "SELECT set_config('app.role', 'employee', true), "
                "set_config('app.business_line', 'loans', true), "
                "set_config('app.platform_scope', 'false', true), "
                "set_config('app.auth_user_uuid', :actor, true), "
                "set_config('app.client_profile_uuid', '', true), "
                "set_config('app.agent_profile_uuid', '', true), "
                "set_config('app.staff_profile_uuid', :actor, true)"
            ),
            {"actor": str(uuid.uuid4())},
        )
        with pytest.raises(DBAPIError):
            await db.execute(
                text("UPDATE leads SET name = 'Employee overwrite' WHERE id = :id"),
                {"id": lead_id},
            )


@pytest.mark.asyncio
async def test_database_trigger_rejects_client_ownership_spoofing(
    client: AsyncClient,
) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    details = await client.get(
        "/api/v1/client/lead-details/loans",
        headers={"Authorization": f"Bearer {token}"},
    )
    lead_id = details.json()["id"]
    auth_user_uuid = await _auth_user_uuid(mobile)

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        profile_uuid = await db.scalar(
            select(ClientProfile.id).where(
                ClientProfile.auth_user_uuid == uuid.UUID(auth_user_uuid),
                ClientProfile.business_line == "loans",
            )
        )
        assert profile_uuid is not None
        await db.execute(text("SET LOCAL ROLE api_user"))
        await db.execute(
            text(
                "SELECT set_config('app.role', 'client', true), "
                "set_config('app.business_line', 'loans', true), "
                "set_config('app.platform_scope', 'false', true), "
                "set_config('app.auth_user_uuid', :actor, true), "
                "set_config('app.client_profile_uuid', :profile, true), "
                "set_config('app.agent_profile_uuid', '', true), "
                "set_config('app.staff_profile_uuid', '', true)"
            ),
            {"actor": auth_user_uuid, "profile": str(profile_uuid)},
        )
        with pytest.raises(DBAPIError):
            await db.execute(
                text(
                    "UPDATE leads "
                    "SET detail_ownership = detail_ownership || "
                    "jsonb_build_object("
                    "'requirement.hijack', jsonb_build_object("
                    "'role', 'client', 'subject_uuid', :profile)) "
                    "WHERE id = :id"
                ),
                {"id": lead_id, "profile": str(profile_uuid)},
            )


@pytest.mark.asyncio
async def test_database_trigger_rejects_client_overwrite_of_agent_detail(
    client: AsyncClient,
) -> None:
    agent_user, agent_profile = await _seed_agent()
    mobile = unique_mobile()
    created = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "Agent Supplied"},
        headers={"Authorization": f"Bearer {_agent_token(agent_user, agent_profile)}"},
    )
    assert created.status_code == 201, created.text
    lead_id = created.json()["id"]

    _token, _ = await full_registration(client, mobile=mobile, lines=["loans"])
    auth_user_uuid = await _auth_user_uuid(mobile)

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        profile_uuid = await db.scalar(
            select(ClientProfile.id).where(
                ClientProfile.auth_user_uuid == uuid.UUID(auth_user_uuid),
                ClientProfile.business_line == "loans",
            )
        )
        assert profile_uuid is not None
        await db.execute(text("SET LOCAL ROLE api_user"))
        await db.execute(
            text(
                "SELECT set_config('app.role', 'client', true), "
                "set_config('app.business_line', 'loans', true), "
                "set_config('app.platform_scope', 'false', true), "
                "set_config('app.auth_user_uuid', :actor, true), "
                "set_config('app.client_profile_uuid', :profile, true), "
                "set_config('app.agent_profile_uuid', '', true), "
                "set_config('app.staff_profile_uuid', '', true)"
            ),
            {"actor": auth_user_uuid, "profile": str(profile_uuid)},
        )
        with pytest.raises(DBAPIError):
            await db.execute(
                text("UPDATE leads SET name = 'Client overwrite' WHERE id = :id"),
                {"id": lead_id},
            )
