"""Admin-initiated account removal — POST /api/v1/admin/users/{id}/delete
(SRS 5.1, FR-17.4).

Mints role-specific access tokens for an already-registered auth_user, same
pattern as test_admin_leads_assign.py. Requires: running Postgres + Redis.
"""

from __future__ import annotations

import uuid

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
