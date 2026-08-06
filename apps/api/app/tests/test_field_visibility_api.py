"""FR-2.9/FR-15.1/FR-15.4 field projection and contact-link API tests."""

from __future__ import annotations

import asyncio
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, text

from app.core.security import create_access_token
from app.models.field_visibility import (
    ContactShareLink,
    FieldTargetRole,
    FieldVisibilityMode,
)
from app.models.task import Task, TaskStatus
from app.services.field_visibility import (
    ContactShareNotAllowed,
    consume_invitation,
    create_contact_share_link,
    invitation_is_valid,
    update_for_admin,
)
from conftest import full_registration, unique_mobile

from .test_agent_api import _agent_token, _seed_agent
from .test_employee_api import _employee_token, _seed_employee, _seed_task
from .test_loan_config_api import _admin_headers, _auth_user_uuid
from .test_telecaller_api import _seed_assigned_lead, _seed_telecaller, _telecaller_token

_URL = "/api/v1/admin/field-visibility"


@pytest.mark.asyncio
async def test_contact_invitation_fails_closed_after_task_lifecycle_change() -> None:
    """Public bearer checks revalidate current assignment without Redis/API fixtures."""
    employee_auth, employee_profile = await _seed_employee("loans")
    task_id = await _seed_task("loans", employee_profile)
    lead_id = await _task_lead_id(task_id)
    lead_mobile = await _set_lead_details(lead_id, name="Lifecycle Contact", requirement={})
    token = secrets.token_urlsafe(32)

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        db.add(
            ContactShareLink(
                token_hash=hashlib.sha256(token.encode()).hexdigest(),
                task_uuid=uuid.UUID(task_id),
                lead_uuid=uuid.UUID(lead_id),
                created_by_uuid=uuid.UUID(employee_auth),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        await db.commit()
    assert await invitation_is_valid(token) is True

    async with session_module.AsyncSessionLocal() as db:
        task = await db.get(Task, uuid.UUID(task_id))
        assert task is not None
        task.status = TaskStatus.COMPLETED
        await db.commit()
    assert await invitation_is_valid(token) is False
    assert await consume_invitation(token, lead_mobile) is False

    _, replacement_profile = await _seed_employee("loans")
    async with session_module.AsyncSessionLocal() as db:
        task = await db.get(Task, uuid.UUID(task_id))
        assert task is not None
        task.status = TaskStatus.ASSIGNED
        task.assigned_employee_profile_uuid = uuid.UUID(replacement_profile)
        await db.commit()
    assert await invitation_is_valid(token) is False


@pytest.mark.asyncio
async def test_policy_change_and_link_creation_are_serialized() -> None:
    employee_auth, employee_profile = await _seed_employee("loans")
    task_id = await _seed_task("loans", employee_profile)
    lead_id = await _task_lead_id(task_id)

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        await update_for_admin(
            db,
            target_role=FieldTargetRole.EMPLOYEE,
            entity="lead",
            field_key="mobile",
            mode=FieldVisibilityMode.SHARE_LINK,
            actor_uuid=uuid.UUID(employee_auth),
            actor_role="admin",
        )

    async def set_allow() -> None:
        async with session_module.AsyncSessionLocal() as db:
            await update_for_admin(
                db,
                target_role=FieldTargetRole.EMPLOYEE,
                entity="lead",
                field_key="mobile",
                mode=FieldVisibilityMode.ALLOW,
                actor_uuid=uuid.UUID(employee_auth),
                actor_role="admin",
            )

    async def mint_link() -> None:
        async with session_module.AsyncSessionLocal() as db:
            await create_contact_share_link(
                db,
                task_uuid=uuid.UUID(task_id),
                lead_uuid=uuid.UUID(lead_id),
                created_by_uuid=uuid.UUID(employee_auth),
            )

    results = await asyncio.gather(set_allow(), mint_link(), return_exceptions=True)
    assert all(result is None or isinstance(result, ContactShareNotAllowed) for result in results)
    async with session_module.AsyncSessionLocal() as db:
        active_count = await db.scalar(
            select(func.count())
            .select_from(ContactShareLink)
            .where(
                ContactShareLink.task_uuid == uuid.UUID(task_id),
                ContactShareLink.created_by_uuid == uuid.UUID(employee_auth),
                ContactShareLink.revoked_at.is_(None),
                ContactShareLink.used_at.is_(None),
            )
        )
    assert active_count == 0


async def _set_mode(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    role: str,
    entity: str,
    field: str,
    mode: str,
) -> dict:
    response = await client.put(
        _URL,
        headers=headers,
        json={
            "target_role": role,
            "entity": entity,
            "field_key": field,
            "mode": mode,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _set_lead_details(lead_id: str, *, name: str, requirement: dict) -> str:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "UPDATE leads SET name = :name, requirement = CAST(:requirement AS jsonb) "
                    "WHERE id = :id RETURNING mobile"
                ),
                {
                    "id": uuid.UUID(lead_id),
                    "name": name,
                    "requirement": __import__("json").dumps(requirement),
                },
            )
        ).one()
        await db.commit()
        return row.mobile


async def _task_lead_id(task_id: str) -> str:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        value = await db.scalar(
            text("SELECT lead_uuid FROM tasks WHERE id = :id"),
            {"id": uuid.UUID(task_id)},
        )
        assert value is not None
        return str(value)


@pytest.mark.asyncio
async def test_catalogue_is_admin_only_and_mobile_exceptions_are_locked(
    client: AsyncClient,
) -> None:
    assert (await client.get(_URL)).status_code == 401

    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    sub_admin = create_access_token(
        {
            "sub": uid,
            "role": "sub_admin",
            "business_line": "both",
            "platform_scope": "true",
        }
    )
    forbidden = await client.get(_URL, headers={"Authorization": f"Bearer {sub_admin}"})
    assert forbidden.status_code == 403

    headers = await _admin_headers(client)
    response = await client.get(_URL, headers=headers)
    assert response.status_code == 200, response.text
    entries = response.json()["entries"]
    agent_mobile = next(
        entry
        for entry in entries
        if entry["target_role"] == "agent"
        and entry["entity"] == "lead"
        and entry["field_key"] == "mobile"
    )
    employee_mobile = next(
        entry
        for entry in entries
        if entry["target_role"] == "employee"
        and entry["entity"] == "lead"
        and entry["field_key"] == "mobile"
    )
    assert agent_mobile["locked"] is True
    assert agent_mobile["allowed_modes"] == ["allow"]
    assert employee_mobile["allowed_modes"] == ["allow", "deny", "share_link"]

    locked = await client.put(
        _URL,
        headers=headers,
        json={
            "target_role": "telecaller",
            "entity": "lead",
            "field_key": "mobile",
            "mode": "deny",
        },
    )
    assert locked.status_code == 409

    unknown = await client.put(
        _URL,
        headers=headers,
        json={
            "target_role": "employee",
            "entity": "lead",
            "field_key": "password_hash",
            "mode": "allow",
        },
    )
    assert unknown.status_code == 422


@pytest.mark.asyncio
async def test_agent_and_telecaller_projection_omit_denied_fields_but_keep_mobile(
    client: AsyncClient,
) -> None:
    headers = await _admin_headers(client)
    agent_auth, agent_profile = await _seed_agent("loans")
    agent_headers = {"Authorization": f"Bearer {_agent_token(agent_auth, agent_profile)}"}
    agent_create = await client.post(
        "/api/v1/agent/leads",
        headers=agent_headers,
        json={
            "mobile": unique_mobile(),
            "name": "Private Agent Lead",
            "requirement": {"notes": "Private requirement"},
        },
    )
    assert agent_create.status_code == 201, agent_create.text

    tele_auth, tele_profile = await _seed_telecaller("loans")
    tele_lead_id = await _seed_assigned_lead("loans", tele_profile)
    tele_mobile = await _set_lead_details(
        tele_lead_id,
        name="Private Telecaller Lead",
        requirement={"notes": "Do not expose"},
    )
    tele_headers = {"Authorization": f"Bearer {_telecaller_token(tele_auth, tele_profile)}"}

    try:
        for role in ("agent", "telecaller"):
            await _set_mode(
                client,
                headers,
                role=role,
                entity="lead",
                field="name",
                mode="deny",
            )
            await _set_mode(
                client,
                headers,
                role=role,
                entity="lead",
                field="requirement",
                mode="deny",
            )

        agent_response = await client.get("/api/v1/agent/leads", headers=agent_headers)
        assert agent_response.status_code == 200, agent_response.text
        agent_row = next(
            row for row in agent_response.json() if row["id"] == agent_create.json()["id"]
        )
        assert "name" not in agent_row
        assert "requirement" not in agent_row
        assert agent_row["mobile"] == agent_create.json()["mobile"]

        tele_response = await client.get(
            f"/api/v1/telecaller/leads/{tele_lead_id}", headers=tele_headers
        )
        assert tele_response.status_code == 200, tele_response.text
        assert "name" not in tele_response.json()
        assert "requirement" not in tele_response.json()
        assert tele_response.json()["mobile"] == tele_mobile
    finally:
        for role in ("agent", "telecaller"):
            for field in ("name", "requirement"):
                await _set_mode(
                    client,
                    headers,
                    role=role,
                    entity="lead",
                    field=field,
                    mode="allow",
                )


@pytest.mark.asyncio
async def test_employee_allow_deny_and_revocable_provider_neutral_share_link(
    client: AsyncClient,
) -> None:
    admin_headers = await _admin_headers(client)
    employee_auth, employee_profile = await _seed_employee("loans")
    task_id = await _seed_task("loans", employee_profile)
    lead_id = await _task_lead_id(task_id)
    lead_mobile = await _set_lead_details(lead_id, name="Employee Contact", requirement={})
    employee_headers = {
        "Authorization": f"Bearer {_employee_token(employee_auth, employee_profile)}"
    }

    try:
        allowed = await client.get(f"/api/v1/employee/tasks/{task_id}", headers=employee_headers)
        assert allowed.status_code == 200, allowed.text
        assert allowed.json()["lead_mobile"] == lead_mobile
        assert allowed.json()["lead_contact_mode"] == "allow"

        await _set_mode(
            client,
            admin_headers,
            role="employee",
            entity="lead",
            field="mobile",
            mode="deny",
        )
        denied = await client.get(f"/api/v1/employee/tasks/{task_id}", headers=employee_headers)
        assert denied.status_code == 200, denied.text
        assert "lead_mobile" not in denied.json()
        assert denied.json()["lead_contact_mode"] == "deny"

        denied_link = await client.post(
            f"/api/v1/employee/tasks/{task_id}/contact-share-links",
            headers=employee_headers,
        )
        assert denied_link.status_code == 409

        await _set_mode(
            client,
            admin_headers,
            role="employee",
            entity="lead",
            field="mobile",
            mode="share_link",
        )
        shared = await client.get(f"/api/v1/employee/tasks/{task_id}", headers=employee_headers)
        assert shared.status_code == 200, shared.text
        assert "lead_mobile" not in shared.json()
        assert shared.json()["lead_contact_mode"] == "share_link"

        created = await client.post(
            f"/api/v1/employee/tasks/{task_id}/contact-share-links",
            headers=employee_headers,
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert lead_mobile not in body["share_path"]
        token = body["share_path"].rsplit("/", 1)[-1]

        import app.db.session as session_module

        async with session_module.AsyncSessionLocal() as db:
            stored = (
                await db.execute(
                    text("SELECT token_hash FROM contact_share_links WHERE id = :id"),
                    {"id": uuid.UUID(body["id"])},
                )
            ).scalar_one()
        assert stored == hashlib.sha256(token.encode()).hexdigest()
        assert stored != token

        valid = await client.get(f"/api/v1/leads/invitations/{token}")
        assert valid.status_code == 200, valid.text
        assert valid.json() == {"valid": True}

        revoked = await client.delete(
            f"/api/v1/employee/contact-share-links/{body['id']}",
            headers=employee_headers,
        )
        assert revoked.status_code == 204, revoked.text
        invalid = await client.get(f"/api/v1/leads/invitations/{token}")
        assert invalid.status_code == 200
        assert invalid.json() == {"valid": False}

        second = await client.post(
            f"/api/v1/employee/tasks/{task_id}/contact-share-links",
            headers=employee_headers,
        )
        assert second.status_code == 201, second.text
        second_token = second.json()["share_path"].rsplit("/", 1)[-1]
        await _set_mode(
            client,
            admin_headers,
            role="employee",
            entity="lead",
            field="mobile",
            mode="allow",
        )
        policy_revoked = await client.get(f"/api/v1/leads/invitations/{second_token}")
        assert policy_revoked.status_code == 200
        assert policy_revoked.json() == {"valid": False}

        await _set_mode(
            client,
            admin_headers,
            role="employee",
            entity="lead",
            field="mobile",
            mode="share_link",
        )
        third = await client.post(
            f"/api/v1/employee/tasks/{task_id}/contact-share-links",
            headers=employee_headers,
        )
        assert third.status_code == 201, third.text
        third_token = third.json()["share_path"].rsplit("/", 1)[-1]
        submitted = await client.post(
            "/api/v1/leads",
            json={
                "name": "Employee Contact",
                "mobile": lead_mobile,
                "topic": "loans",
                "origin": "contact",
                "invitation_token": third_token,
            },
        )
        assert submitted.status_code == 202, submitted.text
        consumed = await client.get(f"/api/v1/leads/invitations/{third_token}")
        assert consumed.status_code == 200
        assert consumed.json() == {"valid": False}

        fourth = await client.post(
            f"/api/v1/employee/tasks/{task_id}/contact-share-links",
            headers=employee_headers,
        )
        assert fourth.status_code == 201, fourth.text
        fourth_token = fourth.json()["share_path"].rsplit("/", 1)[-1]
        async with session_module.AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE tasks SET status = 'completed' WHERE id = :task_id"),
                {"task_id": uuid.UUID(task_id)},
            )
            await db.commit()
        closed = await client.get(f"/api/v1/leads/invitations/{fourth_token}")
        assert closed.status_code == 200
        assert closed.json() == {"valid": False}
        closed_create = await client.post(
            f"/api/v1/employee/tasks/{task_id}/contact-share-links",
            headers=employee_headers,
        )
        assert closed_create.status_code == 409

        _, replacement_profile = await _seed_employee("loans")
        async with session_module.AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE tasks SET status = 'assigned' WHERE id = :task_id"),
                {"task_id": uuid.UUID(task_id)},
            )
            await db.commit()
        fifth = await client.post(
            f"/api/v1/employee/tasks/{task_id}/contact-share-links",
            headers=employee_headers,
        )
        assert fifth.status_code == 201, fifth.text
        fifth_token = fifth.json()["share_path"].rsplit("/", 1)[-1]
        async with session_module.AsyncSessionLocal() as db:
            await db.execute(
                text(
                    "UPDATE tasks SET assigned_employee_profile_uuid = :replacement "
                    "WHERE id = :task_id"
                ),
                {
                    "replacement": uuid.UUID(replacement_profile),
                    "task_id": uuid.UUID(task_id),
                },
            )
            await db.commit()
        reassigned = await client.get(f"/api/v1/leads/invitations/{fifth_token}")
        assert reassigned.status_code == 200
        assert reassigned.json() == {"valid": False}
    finally:
        await _set_mode(
            client,
            admin_headers,
            role="employee",
            entity="lead",
            field="mobile",
            mode="allow",
        )


@pytest.mark.asyncio
async def test_employee_cannot_share_another_employees_task(client: AsyncClient) -> None:
    admin_headers = await _admin_headers(client)
    employee_auth, employee_profile = await _seed_employee("loans")
    _, other_profile = await _seed_employee("loans")
    other_task = await _seed_task("loans", other_profile)
    headers = {"Authorization": f"Bearer {_employee_token(employee_auth, employee_profile)}"}
    try:
        await _set_mode(
            client,
            admin_headers,
            role="employee",
            entity="lead",
            field="mobile",
            mode="share_link",
        )
        response = await client.post(
            f"/api/v1/employee/tasks/{other_task}/contact-share-links", headers=headers
        )
        assert response.status_code == 404
    finally:
        await _set_mode(
            client,
            admin_headers,
            role="employee",
            entity="lead",
            field="mobile",
            mode="allow",
        )


@pytest.mark.asyncio
async def test_policy_change_audit_contains_keys_not_contact_values(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    response = await _set_mode(
        client,
        headers,
        role="employee",
        entity="lead",
        field="name",
        mode="deny",
    )
    try:
        audit = await client.get(
            "/api/v1/admin/audit-log",
            headers=headers,
            params={"action": "field_visibility_updated", "entity_type": "field_visibility_config"},
        )
        assert audit.status_code == 200, audit.text
        entry = next(row for row in audit.json()["entries"] if row["entity_uuid"] == response["id"])
        assert entry["detail"]["field_key"] == "name"
        assert "mobile" not in entry["detail"]
        assert "email" not in entry["detail"]
    finally:
        await _set_mode(
            client,
            headers,
            role="employee",
            entity="lead",
            field="name",
            mode="allow",
        )
