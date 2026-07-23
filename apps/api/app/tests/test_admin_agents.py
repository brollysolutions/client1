"""Admin agent-application approval queue API — no public submit endpoint exists
yet (deferred), so tests insert AgentApplication rows directly, mirroring what
app/scripts/seed_agent_applications.py does for the dev queue.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _create_pending_application(
    mobile: str | None = None, applicant_auth_user_uuid: str | None = None
) -> str:
    import app.db.session as session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with session_mod.AsyncSessionLocal() as db:
        application = AgentApplication(
            applicant_auth_user_uuid=applicant_auth_user_uuid,
            first_name="Ravi",
            last_name="Kumar",
            mobile=mobile,
            business_line="real_estate",
            rera_code="RERA/AG/2026/00099",
            status=SubmissionStatus.PENDING,
        )
        db.add(application)
        await db.commit()
        await db.refresh(application)
        return str(application.id)


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_line_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "false"}
    )


@pytest.mark.asyncio
async def test_admin_lists_pending_applications(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    await _create_pending_application(mobile=unique_mobile())
    res = await client.get(
        "/api/v1/admin/agents",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["applications"]) >= 1


@pytest.mark.asyncio
async def test_approve_creates_new_agent_account(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["business_line"] == "real_estate"
    assert body["agent_code"].startswith("AG-")
    assert body["temp_password"]  # brand-new account gets a temp password


@pytest.mark.asyncio
async def test_approve_reuses_existing_account_no_temp_password(client: AsyncClient) -> None:
    _, applicant_mobile = await full_registration(client)
    applicant_uid = await _auth_user_uuid(applicant_mobile)
    app_id = await _create_pending_application(applicant_auth_user_uuid=applicant_uid)

    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["temp_password"] is None


@pytest.mark.asyncio
async def test_double_approve_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}
    first = await client.post(f"/api/v1/admin/agents/{app_id}/approve", headers=headers)
    assert first.status_code == 200
    second = await client.post(f"/api/v1/admin/agents/{app_id}/approve", headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_reject_sets_status(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/reject",
        json={"note": "RERA number could not be verified."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_line_sub_admin_cannot_approve(client: AsyncClient) -> None:
    """RLS would allow this (agent_applications_rls has no line predicate for
    non-platform staff — only require_admin gates approve/reject), so this proves
    the app-layer wall, not the data-layer one."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_sub_admin_line_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_approve_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        f"/api/v1/admin/agents/{uuid.uuid4()}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_new_agent_logs_in_via_forced_reset(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    agent_mobile = unique_mobile()
    app_id = await _create_pending_application(mobile=agent_mobile)
    approved = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert approved.status_code == 200, approved.text
    temp_password = approved.json()["temp_password"]
    assert temp_password

    login_res = await client.post(
        "/api/v1/auth/login",
        json={"mobile": agent_mobile, "password": temp_password},
    )
    assert login_res.status_code == 200, login_res.text
