"""Main Admin hierarchy, Sub Admin payout grants, and standalone payouts."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.profile import (
    ProfileScope,
    ProfileStatus,
    StaffFeatureGrant,
    StaffProfile,
    StaffRole,
)
from app.models.user import User
from conftest import do_login, full_registration, unique_email, unique_mobile


async def _user_id(mobile: str) -> uuid.UUID:
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        return await db.scalar(select(User.id).where(User.mobile == mobile))


def _staff_token(
    *,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    role: str,
    session_version: int = 1,
    features: list[str] | None = None,
) -> str:
    return create_access_token(
        {
            "sub": str(user_id),
            "role": role,
            "business_line": "",
            "platform_scope": "true",
            "staff_profile_uuid": str(profile_id),
            "staff_features": features or [],
            "session_version": session_version,
        }
    )


async def _primary_admin(client: AsyncClient) -> tuple[str, uuid.UUID, uuid.UUID]:
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        existing = await db.scalar(
            select(StaffProfile).where(StaffProfile.is_primary_admin.is_(True))
        )
        if existing is not None:
            user = await db.get(User, existing.auth_user_uuid)
            return (
                _staff_token(
                    user_id=user.id,
                    profile_id=existing.id,
                    role="admin",
                    session_version=user.session_version,
                ),
                user.id,
                existing.id,
            )

    _, mobile = await full_registration(client)
    user_id = await _user_id(mobile)
    profile = StaffProfile(
        auth_user_uuid=user_id,
        role=StaffRole.ADMIN,
        scope=ProfileScope.PLATFORM,
        business_line=None,
        staff_code=f"MAIN{uuid.uuid4().hex[:8]}",
        status=ProfileStatus.ACTIVE,
        is_primary_admin=True,
    )
    async with session_mod.AsyncSessionLocal() as db:
        db.add(profile)
        await db.commit()
    return (
        _staff_token(user_id=user_id, profile_id=profile.id, role="admin"),
        user_id,
        profile.id,
    )


async def _sub_admin(client: AsyncClient) -> tuple[str, uuid.UUID, uuid.UUID, str]:
    import app.db.session as session_mod

    _, mobile = await full_registration(client)
    user_id = await _user_id(mobile)
    profile = StaffProfile(
        auth_user_uuid=user_id,
        role=StaffRole.SUB_ADMIN,
        scope=ProfileScope.PLATFORM,
        business_line=None,
        staff_code=f"SUB{uuid.uuid4().hex[:8]}",
        status=ProfileStatus.ACTIVE,
    )
    async with session_mod.AsyncSessionLocal() as db:
        db.add(profile)
        await db.commit()
    return (
        _staff_token(user_id=user_id, profile_id=profile.id, role="sub_admin"),
        user_id,
        profile.id,
        mobile,
    )


async def _additional_admin(client: AsyncClient) -> tuple[str, uuid.UUID, uuid.UUID]:
    primary_token, _primary_user_id, _primary_profile_id = await _primary_admin(client)
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        profile = await db.scalar(
            select(StaffProfile).where(
                StaffProfile.role == StaffRole.ADMIN,
                StaffProfile.status == ProfileStatus.ACTIVE,
                StaffProfile.is_primary_admin.is_(False),
            )
        )
    if profile is None:
        mobile = unique_mobile()
        created = await client.post(
            "/api/v1/admin/users/create",
            headers=_headers(primary_token),
            json={
                "first_name": "Additional",
                "last_name": "Admin",
                "mobile": mobile,
                "email": unique_email(),
                "role": "admin",
            },
        )
        assert created.status_code == 201, created.text
        user_id = await _user_id(mobile)
        async with session_mod.AsyncSessionLocal() as db:
            profile = await db.scalar(
                select(StaffProfile).where(
                    StaffProfile.auth_user_uuid == user_id,
                    StaffProfile.role == StaffRole.ADMIN,
                )
            )
    async with session_mod.AsyncSessionLocal() as db:
        user = await db.get(User, profile.auth_user_uuid)
    return (
        _staff_token(
            user_id=user.id,
            profile_id=profile.id,
            role="admin",
            session_version=user.session_version,
        ),
        user.id,
        profile.id,
    )


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _manual_payout(recipient_user_uuid: uuid.UUID, suffix: str) -> dict:
    return {
        "recipient_user_uuid": str(recipient_user_uuid),
        "type": "cashback",
        "business_line": "loans",
        "amount_paise": 2500,
        "destination_type": "cheque",
        "destination": {},
        "idempotency_key": f"hierarchy-{suffix}-{uuid.uuid4().hex[:12]}",
    }


@pytest.mark.asyncio
async def test_primary_admin_can_create_only_three_additional_admins(
    client: AsyncClient,
) -> None:
    primary_token, primary_user_id, _primary_profile_id = await _primary_admin(client)
    access = await client.get("/api/v1/admin/staff-access", headers=_headers(primary_token))
    assert access.status_code == 200, access.text
    count = access.json()["additional_admin_count"]

    for index in range(max(0, 3 - count)):
        admin_mobile = unique_mobile()
        created = await client.post(
            "/api/v1/admin/users/create",
            headers=_headers(primary_token),
            json={
                "first_name": "Delegated",
                "last_name": f"Admin {index}",
                "mobile": admin_mobile,
                "email": unique_email(),
                "role": "admin",
            },
        )
        assert created.status_code == 201, created.text

    overflow = await client.post(
        "/api/v1/admin/users/create",
        headers=_headers(primary_token),
        json={
            "first_name": "Fourth",
            "last_name": "Admin",
            "mobile": unique_mobile(),
            "email": unique_email(),
            "role": "admin",
        },
    )
    assert overflow.status_code == 409

    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        secondary_profile = await db.scalar(
            select(StaffProfile).where(
                StaffProfile.role == StaffRole.ADMIN,
                StaffProfile.status == ProfileStatus.ACTIVE,
                StaffProfile.is_primary_admin.is_(False),
            )
        )
        secondary_user = await db.get(User, secondary_profile.auth_user_uuid)
    secondary_token = _staff_token(
        user_id=secondary_user.id,
        profile_id=secondary_profile.id,
        role="admin",
        session_version=secondary_user.session_version,
    )
    denied = await client.post(
        "/api/v1/admin/users/create",
        headers=_headers(secondary_token),
        json={
            "first_name": "No",
            "last_name": "Delegation",
            "mobile": unique_mobile(),
            "email": unique_email(),
            "role": "admin",
        },
    )
    assert denied.status_code == 403
    protected = await client.post(
        f"/api/v1/admin/users/{primary_user_id}/delete",
        headers=_headers(secondary_token),
        json={"reason": "Main Admin lifecycle invariant"},
    )
    assert protected.status_code == 409


@pytest.mark.asyncio
async def test_main_admin_grants_sub_admin_payout_requests_and_admin_approves(
    client: AsyncClient,
) -> None:
    primary_token, _primary_user_id, _primary_profile_id = await _primary_admin(client)
    old_sub_token, sub_user_id, sub_profile_id, sub_mobile = await _sub_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_user_id = await _user_id(recipient_mobile)

    denied = await client.get("/api/v1/payouts", headers=_headers(old_sub_token))
    assert denied.status_code == 403

    granted = await client.put(
        f"/api/v1/admin/staff-access/{sub_profile_id}/features",
        headers=_headers(primary_token),
        json={"feature": "payout_requests", "enabled": True},
    )
    assert granted.status_code == 200, granted.text
    target = next(
        entry
        for entry in granted.json()["entries"]
        if entry["staff_profile_uuid"] == str(sub_profile_id)
    )
    assert target["features"] == ["payout_requests"]

    invalidated = await client.get("/api/v1/payouts", headers=_headers(old_sub_token))
    assert invalidated.status_code == 401

    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        assert await db.get(StaffFeatureGrant, (sub_profile_id, "payout_requests")) is not None
    # A normal login must load the persisted grant into signed access claims;
    # the route and payout RLS context consume that claim on the next request.
    sub_token = await do_login(client, sub_mobile)

    search = await client.get(
        "/api/v1/payouts/recipients",
        params={"q": recipient_mobile[-6:]},
        headers=_headers(sub_token),
    )
    assert search.status_code == 200, search.text
    assert any(
        row["auth_user_uuid"] == str(recipient_user_id) for row in search.json()["recipients"]
    )

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(sub_token),
        json=_manual_payout(recipient_user_id, "sub-admin"),
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending_approval"

    sub_approve = await client.post(
        f"/api/v1/payouts/{created.json()['id']}/approve",
        headers=_headers(sub_token),
    )
    assert sub_approve.status_code == 403

    approved = await client.post(
        f"/api/v1/payouts/{created.json()['id']}/approve",
        headers=_headers(primary_token),
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    revoked = await client.put(
        f"/api/v1/admin/staff-access/{sub_profile_id}/features",
        headers=_headers(primary_token),
        json={"feature": "payout_requests", "enabled": False},
    )
    assert revoked.status_code == 200, revoked.text
    target = next(
        entry
        for entry in revoked.json()["entries"]
        if entry["staff_profile_uuid"] == str(sub_profile_id)
    )
    assert target["features"] == []
    assert (await client.get("/api/v1/payouts", headers=_headers(sub_token))).status_code == 401
    signed_in_without_grant = await do_login(client, sub_mobile)
    assert (
        await client.get("/api/v1/payouts", headers=_headers(signed_in_without_grant))
    ).status_code == 403


@pytest.mark.asyncio
async def test_main_admin_payout_is_standalone_and_has_no_checker(
    client: AsyncClient,
) -> None:
    primary_token, _primary_user_id, _primary_profile_id = await _primary_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_user_id = await _user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(primary_token),
        json=_manual_payout(recipient_user_id, "main-admin"),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "approved"
    assert body["checker_user_uuid"] is None
    assert body["viewer_can_approve"] is False


@pytest.mark.asyncio
async def test_additional_admin_payout_requires_a_different_admin(
    client: AsyncClient,
) -> None:
    primary_token, _primary_user_id, _primary_profile_id = await _primary_admin(client)
    additional_token, _additional_user_id, _additional_profile_id = await _additional_admin(client)
    _, recipient_mobile = await full_registration(client, lines=["loans"])
    recipient_user_id = await _user_id(recipient_mobile)

    created = await client.post(
        "/api/v1/payouts",
        headers=_headers(additional_token),
        json=_manual_payout(recipient_user_id, "additional-admin"),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "pending_approval"

    self_approval = await client.post(
        f"/api/v1/payouts/{body['id']}/approve",
        headers=_headers(additional_token),
    )
    assert self_approval.status_code == 403
    approved = await client.post(
        f"/api/v1/payouts/{body['id']}/approve",
        headers=_headers(primary_token),
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
