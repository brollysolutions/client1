"""Staff first-login invite links — issue, consume, revoke, and the refusals.

The flow replaces relaying a generated temp password out of band, so the tests
that matter most are the ones proving a link cannot become an account-takeover
primitive: it is single-use, expiring, revocable, refuses an account that
already has a chosen password, and enforces the same password policy the forced
reset does.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_email, unique_mobile

_STRONG_PASSWORD = "Onboard@2026x"


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _user_status(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return await db.scalar(
            text("SELECT status FROM auth_users WHERE mobile = :m"), {"m": mobile}
        )


async def _expire_link(link_id: str) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE staff_invite_links SET expires_at = :past WHERE id = :id"),
            {"past": datetime.now(UTC) - timedelta(minutes=1), "id": link_id},
        )
        await db.commit()


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


async def _provision_staff(client: AsyncClient, headers: dict[str, str]) -> tuple[str, str]:
    """Create a telecaller and return (mobile, auth_user_uuid)."""
    mobile = unique_mobile()
    created = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Nadia",
            "last_name": "Sheikh",
            "mobile": mobile,
            "email": unique_email(),
            "role": "telecaller",
            "business_line": "loans",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return mobile, await _auth_user_uuid(mobile)


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    _, admin_mobile = await full_registration(client)
    return {"Authorization": f"Bearer {_admin_token(await _auth_user_uuid(admin_mobile))}"}


@pytest.mark.asyncio
async def test_invite_link_lets_staff_set_their_own_password(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    staff_mobile, staff_uid = await _provision_staff(client, headers)

    issued = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    assert issued.status_code == 201, issued.text
    body = issued.json()
    token = body["share_path"].removeprefix("/staff-invite/")
    assert token and token != body["share_path"]

    preview = await client.get(f"/api/v1/staff-invites/{token}")
    assert preview.status_code == 200, preview.text
    # First name and role only — nothing a guessed token turns into contact
    # details.
    assert preview.json() == {"first_name": "Nadia", "role": "telecaller"}

    accepted = await client.post(
        f"/api/v1/staff-invites/{token}/accept",
        json={"password": _STRONG_PASSWORD, "confirm_password": _STRONG_PASSWORD},
    )
    assert accepted.status_code == 200, accepted.text
    assert await _user_status(staff_mobile) == "active"

    login = await client.post(
        "/api/v1/auth/login", json={"mobile": staff_mobile, "password": _STRONG_PASSWORD}
    )
    assert login.status_code == 200, login.text


@pytest.mark.asyncio
async def test_invite_link_is_single_use(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    _, staff_uid = await _provision_staff(client, headers)
    issued = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    token = issued.json()["share_path"].removeprefix("/staff-invite/")

    first = await client.post(
        f"/api/v1/staff-invites/{token}/accept",
        json={"password": _STRONG_PASSWORD, "confirm_password": _STRONG_PASSWORD},
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/api/v1/staff-invites/{token}/accept",
        json={"password": "Different@2026x", "confirm_password": "Different@2026x"},
    )
    assert second.status_code == 404

    # A spent token must look exactly like a wrong guess.
    assert (await client.get(f"/api/v1/staff-invites/{token}")).status_code == 404


@pytest.mark.asyncio
async def test_reissuing_revokes_the_previous_link(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    _, staff_uid = await _provision_staff(client, headers)

    first = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    old_token = first.json()["share_path"].removeprefix("/staff-invite/")
    second = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    new_token = second.json()["share_path"].removeprefix("/staff-invite/")
    assert old_token != new_token

    # Two live links would mean two working credentials for one account.
    assert (await client.get(f"/api/v1/staff-invites/{old_token}")).status_code == 404
    assert (await client.get(f"/api/v1/staff-invites/{new_token}")).status_code == 200


@pytest.mark.asyncio
async def test_revoked_and_expired_links_are_refused(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    _, revoke_uid = await _provision_staff(client, headers)
    issued = await client.post(f"/api/v1/admin/users/{revoke_uid}/invite-link", headers=headers)
    revoked_token = issued.json()["share_path"].removeprefix("/staff-invite/")

    dropped = await client.delete(
        f"/api/v1/admin/invite-links/{issued.json()['id']}", headers=headers
    )
    assert dropped.status_code == 204
    assert (await client.get(f"/api/v1/staff-invites/{revoked_token}")).status_code == 404

    _, expire_uid = await _provision_staff(client, headers)
    expiring = await client.post(f"/api/v1/admin/users/{expire_uid}/invite-link", headers=headers)
    expired_token = expiring.json()["share_path"].removeprefix("/staff-invite/")
    await _expire_link(expiring.json()["id"])
    assert (await client.get(f"/api/v1/staff-invites/{expired_token}")).status_code == 404

    accepted = await client.post(
        f"/api/v1/staff-invites/{expired_token}/accept",
        json={"password": _STRONG_PASSWORD, "confirm_password": _STRONG_PASSWORD},
    )
    assert accepted.status_code == 404


@pytest.mark.asyncio
async def test_cannot_invite_an_account_that_already_chose_a_password(
    client: AsyncClient,
) -> None:
    """An Admin-minted link that could overwrite a working credential would be
    an account-takeover primitive, not an onboarding convenience."""
    headers = await _admin_headers(client)
    _, staff_uid = await _provision_staff(client, headers)
    issued = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    token = issued.json()["share_path"].removeprefix("/staff-invite/")
    await client.post(
        f"/api/v1/staff-invites/{token}/accept",
        json={"password": _STRONG_PASSWORD, "confirm_password": _STRONG_PASSWORD},
    )

    again = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    assert again.status_code == 409

    # A self-registered client is not staff and cannot be invited either.
    _, client_mobile = await full_registration(client)
    client_uid = await _auth_user_uuid(client_mobile)
    assert (
        await client.post(f"/api/v1/admin/users/{client_uid}/invite-link", headers=headers)
    ).status_code == 409


@pytest.mark.asyncio
async def test_password_policy_is_enforced_on_accept(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    staff_mobile, staff_uid = await _provision_staff(client, headers)
    issued = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    token = issued.json()["share_path"].removeprefix("/staff-invite/")

    weak = await client.post(
        f"/api/v1/staff-invites/{token}/accept",
        json={"password": "password", "confirm_password": "password"},
    )
    assert weak.status_code == 422

    mismatched = await client.post(
        f"/api/v1/staff-invites/{token}/accept",
        json={"password": _STRONG_PASSWORD, "confirm_password": "Something@2026x"},
    )
    assert mismatched.status_code == 422

    # A rejected attempt must not burn the link.
    assert (await client.get(f"/api/v1/staff-invites/{token}")).status_code == 200
    assert await _user_status(staff_mobile) == "pending_password_reset"


@pytest.mark.asyncio
async def test_only_platform_admin_may_issue_or_revoke(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    _, staff_uid = await _provision_staff(client, headers)
    issued = await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=headers)
    link_id = issued.json()["id"]

    _, other_mobile = await full_registration(client)
    other_uid = await _auth_user_uuid(other_mobile)
    sub_admin = {
        "Authorization": "Bearer "
        + create_access_token(
            {
                "sub": other_uid,
                "role": "sub_admin",
                "business_line": "loans",
                "platform_scope": "true",
            }
        )
    }

    assert (
        await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link", headers=sub_admin)
    ).status_code == 403
    assert (
        await client.delete(f"/api/v1/admin/invite-links/{link_id}", headers=sub_admin)
    ).status_code == 403
    assert (await client.post(f"/api/v1/admin/users/{staff_uid}/invite-link")).status_code == 401


@pytest.mark.asyncio
async def test_unknown_token_is_indistinguishable_from_a_wrong_guess(
    client: AsyncClient,
) -> None:
    long_guess = "z" * 43
    assert (await client.get(f"/api/v1/staff-invites/{long_guess}")).status_code == 404
    # Too short to be a token we minted: rejected before any query runs.
    assert (await client.get("/api/v1/staff-invites/short")).status_code == 404
