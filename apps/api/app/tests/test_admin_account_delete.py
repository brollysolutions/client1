"""Admin-initiated account removal — POST /api/v1/admin/users/{id}/delete
(SRS 5.1, FR-17.4).

Mints role-specific access tokens for an already-registered auth_user, same
pattern as test_admin_leads_assign.py. Requires: running Postgres + Redis.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import PASSWORD, full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _get_status(uid: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT status FROM auth_users WHERE id = :id"), {"id": uid})
        ).fetchone()
        assert row is not None
        return row[0]


async def _get_status_audits(uid: str) -> list[dict]:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text(
                    "SELECT actor_uuid, actor_role, detail FROM audit_log "
                    "WHERE entity_uuid = :id AND action = 'account_status_updated' "
                    "ORDER BY created_at"
                ),
                {"id": uid},
            )
        ).mappings()
        return [dict(row) for row in rows]


async def _personalization_preference_exists(uid: str) -> bool:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        value = await db.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM personalization_preferences "
                "WHERE auth_user_uuid = :id)"
            ),
            {"id": uid},
        )
        return bool(value)


async def _get_auth_event_reason(uid: str) -> tuple[str | None, str | None]:
    """Returns (actor_auth_user_uuid, reason) from the most recent account_deleted event."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT detail FROM auth_events "
                    "WHERE auth_user_uuid = :id AND event_type = 'account_deleted' "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"id": uid},
            )
        ).fetchone()
        assert row is not None
        detail = row[0]
        return detail.get("actor_auth_user_uuid"), detail.get("reason")


async def _seed_ticket(auth_user_uuid: str) -> str:
    """Insert a support_ticket via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.support_ticket import SupportCategory, SupportTicket

    async with _session_mod.AsyncSessionLocal() as db:
        ticket = SupportTicket(
            auth_user_uuid=uuid.UUID(auth_user_uuid),
            category=SupportCategory.GENERAL,
            subject="Need help",
            body="Something went wrong.",
        )
        db.add(ticket)
        await db.commit()
        return str(ticket.id)


async def _get_ticket(ticket_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT subject, body, category, status FROM support_tickets WHERE id = :id"),
                {"id": ticket_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "false"}
    )


def _line_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "loans", "platform_scope": "false"}
    )


async def test_sub_admin_forbidden(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)

    resp = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete",
        json={"reason": "suspicious activity"},
        headers={"Authorization": f"Bearer {_sub_admin_token(admin_uid)}"},
    )
    assert resp.status_code == 403


async def test_admin_deletes_account_and_persists_reason(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)

    resp = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete",
        json={"reason": "duplicate account, flagged by support"},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert resp.status_code == 200, resp.text

    assert await _get_status(target_uid) == "soft_deleted"
    actor, reason = await _get_auth_event_reason(target_uid)
    assert actor == admin_uid
    assert reason == "duplicate account, flagged by support"


async def test_admin_user_list_redacts_deleted_tombstone_contacts(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client, lines=["loans", "real_estate"])
    target_uid = await _auth_user_uuid(target_mobile)
    headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}

    deleted = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete",
        json={"reason": "duplicate account"},
        headers=headers,
    )
    assert deleted.status_code == 200, deleted.text

    listed = await client.get("/api/v1/admin/users", params={"limit": 200}, headers=headers)
    assert listed.status_code == 200, listed.text
    account = next(user for user in listed.json()["users"] if user["id"] == target_uid)
    assert account["status"] == "soft_deleted"
    assert account["email"] is None
    assert account["mobile"] is None
    assert [profile["status"] for profile in account["client_profiles"]] == [
        "inactive",
        "inactive",
    ]


async def test_admin_user_list_redacts_malformed_legacy_email(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE auth_users SET email = :email WHERE id = :id"),
            {"email": f"legacy-{uuid.uuid4().hex}@example.test", "id": target_uid},
        )
        await db.commit()

    listed = await client.get(
        "/api/v1/admin/users", headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"}
    )

    assert listed.status_code == 200, listed.text
    account = next(user for user in listed.json()["users"] if user["id"] == target_uid)
    assert account["email"] is None


async def test_admin_delete_erases_private_personalization_preference(
    client: AsyncClient,
) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    target_access, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)
    created = await client.patch(
        "/api/v1/personalization/preferences",
        json={"personalization_enabled": True},
        headers={"Authorization": f"Bearer {target_access}"},
    )
    assert created.status_code == 200, created.text
    assert await _personalization_preference_exists(target_uid)

    response = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete",
        json={"reason": "duplicate account"},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )

    assert response.status_code == 200, response.text
    assert not await _personalization_preference_exists(target_uid)


async def test_admin_delete_already_deleted_returns_409(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)

    headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}
    first = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete", json={"reason": "r1"}, headers=headers
    )
    assert first.status_code == 200

    second = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete", json={"reason": "r2"}, headers=headers
    )
    assert second.status_code == 409


async def test_admin_delete_nonexistent_returns_404(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)

    resp = await client.post(
        f"/api/v1/admin/users/{uuid.uuid4()}/delete",
        json={"reason": "r"},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert resp.status_code == 404


async def test_admin_cannot_delete_own_account_via_admin_endpoint(client: AsyncClient) -> None:
    """This path never blacklists the caller's own token (actor_jti is always
    None for the admin endpoint) — self-deletion must go through DELETE
    /auth/me instead, which does."""
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)

    resp = await client.post(
        f"/api/v1/admin/users/{admin_uid}/delete",
        json={"reason": "oops"},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert resp.status_code == 400
    assert await _get_status(admin_uid) == "active"


async def test_admin_delete_missing_reason_returns_422(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)

    resp = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete",
        json={},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert resp.status_code == 422


async def test_admin_delete_scrubs_target_support_ticket_text(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)
    ticket_id = await _seed_ticket(target_uid)

    resp = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete",
        json={"reason": "r"},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert resp.status_code == 200

    ticket = await _get_ticket(ticket_id)
    assert ticket["subject"] == "[deleted account — content removed]"
    assert ticket["body"] == "[deleted account — content removed]"
    assert ticket["category"] == "general"
    assert ticket["status"] == "open"


async def test_admin_delete_revokes_target_refresh_token(client: AsyncClient) -> None:
    """The RLS gap this covers: refresh_tokens_rls has no platform_scope branch,
    so revocation must happen on the bypass session (Phase B), not the admin's
    own request-scoped session."""
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)

    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)
    # Log the target in for real, to mint a genuine refresh cookie for it.
    login = await client.post(
        "/api/v1/auth/login",
        json={"mobile": target_mobile, "password": PASSWORD},
    )
    assert login.status_code == 200
    target_refresh_cookie = client.cookies.get("refresh_token")

    resp = await client.post(
        f"/api/v1/admin/users/{target_uid}/delete",
        json={"reason": "r"},
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert resp.status_code == 200

    client.cookies.set("refresh_token", target_refresh_cookie)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


@pytest.mark.asyncio
async def test_platform_admin_can_list_and_suspend_user(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    target_token, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)
    headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}
    # Keep this evidence on the two freshly-created operational users. The
    # exhaustive coverage registry separately records the observed failure when
    # a page includes an older soft-deleted account's tombstone email.
    listed = await client.get("/api/v1/admin/users?limit=2", headers=headers)
    assert listed.status_code == 200, listed.text
    assert any(row["id"] == target_uid for row in listed.json()["users"])
    suspended = await client.patch(
        f"/api/v1/admin/users/{target_uid}/status",
        json={"status": "suspended", "reason": "support review"},
        headers=headers,
    )
    assert suspended.status_code == 200, suspended.text
    assert suspended.json()["status"] == "suspended"
    blocked = await client.get(
        "/api/v1/notifications", headers={"Authorization": f"Bearer {target_token}"}
    )
    assert blocked.status_code == 401

    suspended_audit = (await _get_status_audits(target_uid))[-1]
    assert str(suspended_audit["actor_uuid"]) == admin_uid
    assert suspended_audit["actor_role"] == "admin"
    assert suspended_audit["detail"] == {
        "previous_status": "active",
        "status": "suspended",
        "reason": "support review",
    }

    reactivated = await client.patch(
        f"/api/v1/admin/users/{target_uid}/status",
        json={"status": "active", "reason": "review cleared"},
        headers=headers,
    )
    assert reactivated.status_code == 200, reactivated.text
    assert reactivated.json()["status"] == "active"
    assert await _get_status(target_uid) == "active"
    assert (await _get_status_audits(target_uid))[-1]["detail"] == {
        "previous_status": "suspended",
        "status": "active",
        "reason": "review cleared",
    }
    stale_after_reactivation = await client.get(
        "/api/v1/notifications", headers={"Authorization": f"Bearer {target_token}"}
    )
    assert stale_after_reactivation.status_code == 401

    fresh_login = await client.post(
        "/api/v1/auth/login",
        json={"mobile": target_mobile, "password": PASSWORD},
    )
    assert fresh_login.status_code == 200, fresh_login.text


@pytest.mark.asyncio
async def test_user_operations_reject_client_and_line_scoped_admin(client: AsyncClient) -> None:
    client_token, actor_mobile = await full_registration(client)
    actor_uid = await _auth_user_uuid(actor_mobile)
    _, target_mobile = await full_registration(client)
    target_uid = await _auth_user_uuid(target_mobile)

    for token in (client_token, _line_admin_token(actor_uid)):
        headers = {"Authorization": f"Bearer {token}"}
        listed = await client.get("/api/v1/admin/users", headers=headers)
        assert listed.status_code == 403
        updated = await client.patch(
            f"/api/v1/admin/users/{target_uid}/status",
            json={"status": "suspended", "reason": "unauthorized review"},
            headers=headers,
        )
        assert updated.status_code == 403

    assert await _get_status(target_uid) == "active"
