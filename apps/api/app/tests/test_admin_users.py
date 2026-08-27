"""Admin staff-provisioning API — success, validation, authz, duplicate handling.

Mints role-specific access tokens for an already-registered auth_user (same
pattern as test_property_submissions_api.py): get_current_user reads the mobile
from the row but takes role/business_line/platform_scope from the JWT claims, so
a self-registered client account can act as Admin/Sub Admin for the test.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_email, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _user_email(mobile: str) -> str | None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return await db.scalar(
            text("SELECT email FROM auth_users WHERE mobile = :m"),
            {"m": mobile},
        )


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "true"}
    )


@pytest.mark.asyncio
async def test_admin_creates_sub_admin(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Asha",
            "last_name": "Rao",
            "mobile": unique_mobile(),
            "email": f"asha.{uid[:8]}@example.com",
            "role": "sub_admin",
        },
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["role"] == "sub_admin"
    assert body["business_line"] is None
    assert body["temp_password"]


@pytest.mark.asyncio
async def test_telecaller_without_line_is_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Karan",
            "last_name": "Mehta",
            "mobile": unique_mobile(),
            "email": f"karan.{uid[:8]}@example.com",
            "role": "telecaller",
        },
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_admin_creates_telecaller_with_line(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Karan",
            "last_name": "Mehta",
            "mobile": unique_mobile(),
            "email": f"karan2.{uid[:8]}@example.com",
            "role": "telecaller",
            "business_line": "loans",
        },
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["business_line"] == "loans"


@pytest.mark.asyncio
async def test_admin_creates_dual_line_employee(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Dual",
            "last_name": "Employee",
            "mobile": unique_mobile(),
            "email": f"dual-employee.{uid[:8]}@example.com",
            "role": "employee",
            "business_line": "both",
        },
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["business_line"] == "both"


@pytest.mark.asyncio
async def test_sub_admin_with_business_line_is_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Asha",
            "last_name": "Rao",
            "mobile": unique_mobile(),
            "email": f"asha2.{uid[:8]}@example.com",
            "role": "sub_admin",
            "business_line": "loans",
        },
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_non_admin_cannot_provision(client: AsyncClient) -> None:
    """A platform sub_admin's JWT would satisfy RLS's platform_scope check, but
    require_admin blocks it anyway — that app-layer gate is the real wall."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Asha",
            "last_name": "Rao",
            "mobile": unique_mobile(),
            "email": f"asha3.{uid[:8]}@example.com",
            "role": "sub_admin",
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_duplicate_mobile_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    target_mobile = unique_mobile()
    payload = {
        "first_name": "Dev",
        "last_name": "Singh",
        "mobile": target_mobile,
        "email": f"dev.{uid[:8]}@example.com",
        "role": "sub_admin",
    }
    first = await client.post(
        "/api/v1/admin/users/create",
        json=payload,
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        "/api/v1/admin/users/create",
        json={**payload, "email": f"dev2.{uid[:8]}@example.com"},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_existing_mobile_only_client_gets_staff_email(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client)
    staff_email = unique_email()

    response = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Dev",
            "last_name": "Singh",
            "mobile": target_mobile,
            "email": staff_email,
            "role": "sub_admin",
        },
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["temp_password"] is None
    assert await _user_email(target_mobile) == staff_email


@pytest.mark.asyncio
async def test_new_staff_account_logs_in_via_forced_reset(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    new_mobile = unique_mobile()
    created = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Neha",
            "last_name": "Joshi",
            "mobile": new_mobile,
            "email": f"neha.{uid[:8]}@example.com",
            "role": "sub_admin",
        },
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert created.status_code == 201, created.text
    temp_password = created.json()["temp_password"]
    assert temp_password

    login_res = await client.post(
        "/api/v1/auth/login",
        json={"mobile": new_mobile, "password": temp_password},
    )
    assert login_res.status_code == 200, login_res.text
    access_token = login_res.json()["access_token"]

    change_res = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": temp_password,
            "new_password": "NewPass@123",
            "confirm_password": "NewPass@123",
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert change_res.status_code == 200, change_res.text

    relogin = await client.post(
        "/api/v1/auth/login",
        json={"mobile": new_mobile, "password": "NewPass@123"},
    )
    assert relogin.status_code == 200, relogin.text


@pytest.mark.asyncio
async def test_user_directory_filters_run_server_side(client: AsyncClient) -> None:
    """The console pages this list, so every filter has to reach the query.

    Filtering only the fetched page — which is what the panel used to do —
    hides a match that happens to live on another page.
    """
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    telecaller_mobile = unique_mobile()
    created = await client.post(
        "/api/v1/admin/users/create",
        json={
            "first_name": "Zarina",
            "last_name": "Qureshi",
            "mobile": telecaller_mobile,
            "email": unique_email(),
            "role": "telecaller",
            "business_line": "loans",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text

    by_role = await client.get(
        "/api/v1/admin/users", params={"role": "telecaller", "limit": 200}, headers=headers
    )
    assert by_role.status_code == 200, by_role.text
    role_body = by_role.json()
    assert role_body["total"] >= 1
    assert all("telecaller" in user["roles"] for user in role_body["users"])

    by_search = await client.get(
        "/api/v1/admin/users", params={"search": "Qureshi"}, headers=headers
    )
    assert by_search.status_code == 200, by_search.text
    search_body = by_search.json()
    assert search_body["total"] >= 1
    assert any(user["last_name"] == "Qureshi" for user in search_body["users"])

    # A provisioned staff account has never signed in, so it must survive the
    # never-logged-in filter and disappear from its complement.
    never = await client.get(
        "/api/v1/admin/users",
        params={"search": "Qureshi", "never_logged_in": "true"},
        headers=headers,
    )
    assert never.status_code == 200, never.text
    assert never.json()["total"] >= 1

    has_logged_in = await client.get(
        "/api/v1/admin/users",
        params={"search": "Qureshi", "never_logged_in": "false"},
        headers=headers,
    )
    assert has_logged_in.status_code == 200, has_logged_in.text
    assert has_logged_in.json()["total"] == 0

    # `total` must reflect the predicates, not the unfiltered table, or paging
    # would offer pages that cannot be reached.
    unfiltered = await client.get("/api/v1/admin/users", headers=headers)
    assert unfiltered.json()["total"] >= search_body["total"]

    no_match = await client.get(
        "/api/v1/admin/users", params={"search": "nobody-by-this-name"}, headers=headers
    )
    assert no_match.status_code == 200, no_match.text
    assert no_match.json() == {"users": [], "total": 0}


@pytest.mark.asyncio
async def test_user_directory_status_filter(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    active = await client.get("/api/v1/admin/users", params={"status": "active"}, headers=headers)
    assert active.status_code == 200, active.text
    assert all(user["status"] == "active" for user in active.json()["users"])

    rejected = await client.get(
        "/api/v1/admin/users", params={"status": "not-a-status"}, headers=headers
    )
    assert rejected.status_code == 422
