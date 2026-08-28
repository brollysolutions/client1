"""Approved-Agent setup links: delayed handoff and credential safety."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile

_STRONG_PASSWORD = "Agent@2026Secure"


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT id FROM auth_users WHERE mobile = :mobile"),
                {"mobile": mobile},
            )
        ).one()
        return str(row[0])


async def _create_pending_application(mobile: str) -> str:
    import app.db.session as session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with session_mod.AsyncSessionLocal() as db:
        application = AgentApplication(
            first_name="Asha",
            last_name="Rao",
            mobile=mobile,
            business_line="loans",
            rera_code="RERA/AG/2026/INVITE",
            status=SubmissionStatus.PENDING,
        )
        db.add(application)
        await db.commit()
        await db.refresh(application)
        return str(application.id)


def _admin_token(user_uuid: str) -> str:
    return create_access_token(
        {"sub": user_uuid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    _, mobile = await full_registration(client)
    return {"Authorization": f"Bearer {_admin_token(await _auth_user_uuid(mobile))}"}


async def _approve_agent(client: AsyncClient, headers: dict[str, str]) -> tuple[str, str, str]:
    mobile = unique_mobile()
    application_id = await _create_pending_application(mobile)
    approved = await client.post(f"/api/v1/admin/agents/{application_id}/approve", headers=headers)
    assert approved.status_code == 200, approved.text
    return application_id, mobile, approved.json()["agent_code"]


@pytest.mark.asyncio
async def test_admin_can_send_link_later_and_agent_can_set_password(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    application_id, mobile, agent_code = await _approve_agent(client, headers)

    candidates = await client.get("/api/v1/admin/agent-invites", headers=headers)
    assert candidates.status_code == 200, candidates.text
    assert any(row["application_id"] == application_id for row in candidates.json()["agents"])

    issued = await client.post(
        f"/api/v1/admin/agents/{application_id}/invite-link", headers=headers
    )
    assert issued.status_code == 201, issued.text
    token = issued.json()["share_path"].removeprefix("/agent-invite/")

    preview = await client.get(f"/api/v1/agent-invites/{token}")
    assert preview.status_code == 200, preview.text
    assert preview.json() == {"first_name": "Asha", "agent_code": agent_code}

    accepted = await client.post(
        f"/api/v1/agent-invites/{token}/accept",
        json={"password": _STRONG_PASSWORD, "confirm_password": _STRONG_PASSWORD},
    )
    assert accepted.status_code == 200, accepted.text
    assert (await client.get(f"/api/v1/agent-invites/{token}")).status_code == 404

    login = await client.post(
        "/api/v1/auth/login", json={"mobile": mobile, "password": _STRONG_PASSWORD}
    )
    assert login.status_code == 200, login.text

    refreshed = await client.get("/api/v1/admin/agent-invites", headers=headers)
    assert all(row["application_id"] != application_id for row in refreshed.json()["agents"])


@pytest.mark.asyncio
async def test_reissuing_and_revoking_agent_link_invalidates_old_tokens(
    client: AsyncClient,
) -> None:
    headers = await _admin_headers(client)
    application_id, _, _ = await _approve_agent(client, headers)
    first = await client.post(f"/api/v1/admin/agents/{application_id}/invite-link", headers=headers)
    second = await client.post(
        f"/api/v1/admin/agents/{application_id}/invite-link", headers=headers
    )
    old_token = first.json()["share_path"].removeprefix("/agent-invite/")
    new_token = second.json()["share_path"].removeprefix("/agent-invite/")
    assert old_token != new_token
    assert (await client.get(f"/api/v1/agent-invites/{old_token}")).status_code == 404
    assert (await client.get(f"/api/v1/agent-invites/{new_token}")).status_code == 200

    revoked = await client.delete(
        f"/api/v1/admin/agent-invite-links/{second.json()['id']}", headers=headers
    )
    assert revoked.status_code == 204
    assert (await client.get(f"/api/v1/agent-invites/{new_token}")).status_code == 404


@pytest.mark.asyncio
async def test_expired_and_policy_rejected_agent_links_are_safe(client: AsyncClient) -> None:
    import app.db.session as session_mod

    headers = await _admin_headers(client)
    application_id, _, _ = await _approve_agent(client, headers)
    issued = await client.post(
        f"/api/v1/admin/agents/{application_id}/invite-link", headers=headers
    )
    token = issued.json()["share_path"].removeprefix("/agent-invite/")

    weak = await client.post(
        f"/api/v1/agent-invites/{token}/accept",
        json={"password": "password", "confirm_password": "password"},
    )
    assert weak.status_code == 422
    assert (await client.get(f"/api/v1/agent-invites/{token}")).status_code == 200

    async with session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE agent_invite_links SET expires_at = :past WHERE id = :id"),
            {
                "past": datetime.now(UTC) - timedelta(minutes=1),
                "id": issued.json()["id"],
            },
        )
        await db.commit()
    assert (await client.get(f"/api/v1/agent-invites/{token}")).status_code == 404


@pytest.mark.asyncio
async def test_only_platform_admin_can_manage_agent_links(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    application_id, _, _ = await _approve_agent(client, headers)
    issued = await client.post(
        f"/api/v1/admin/agents/{application_id}/invite-link", headers=headers
    )

    _, other_mobile = await full_registration(client)
    sub_admin = {
        "Authorization": "Bearer "
        + create_access_token(
            {
                "sub": await _auth_user_uuid(other_mobile),
                "role": "sub_admin",
                "business_line": "loans",
                "platform_scope": "true",
            }
        )
    }
    assert (await client.get("/api/v1/admin/agent-invites", headers=sub_admin)).status_code == 403
    assert (
        await client.post(f"/api/v1/admin/agents/{application_id}/invite-link", headers=sub_admin)
    ).status_code == 403
    assert (
        await client.delete(
            f"/api/v1/admin/agent-invite-links/{issued.json()['id']}", headers=sub_admin
        )
    ).status_code == 403
