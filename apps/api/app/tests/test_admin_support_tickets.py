"""Admin support-ticket console — GET/PATCH /api/v1/admin/support-tickets
(docs/specs/admin-support-ticket-console.md).

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

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
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


async def _seed_ticket(auth_user_uuid: str, *, status: str = "open") -> str:
    import app.db.session as _session_mod
    from app.models.support_ticket import SupportCategory, SupportTicket

    async with _session_mod.AsyncSessionLocal() as db:
        ticket = SupportTicket(
            auth_user_uuid=uuid.UUID(auth_user_uuid),
            category=SupportCategory.GENERAL,
            subject=f"Ticket {uuid.uuid4().hex}",
            body="Something went wrong.",
            status=status,
        )
        db.add(ticket)
        await db.commit()
        return str(ticket.id)


async def _get_ticket_row(ticket_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT status, resolution_note FROM support_tickets WHERE id = :id"),
                {"id": ticket_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


async def _notification_count(auth_user_uuid: str, notification_type: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT count(*) FROM notifications WHERE user_uuid = :uid AND type = :t"),
                {"uid": auth_user_uuid, "t": notification_type},
            )
        ).fetchone()
        assert row is not None
        return row[0]


def _admin_token(user_id: str, *, role: str = "admin", platform_scope: str = "true") -> str:
    return create_access_token(
        {"sub": user_id, "role": role, "business_line": "", "platform_scope": platform_scope}
    )


async def _make_admin(client: AsyncClient, *, role: str = "admin") -> tuple[str, str]:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    return _admin_token(uid, role=role), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_no_auth_required_returns_401(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/admin/support-tickets")
    assert resp.status_code == 401


async def test_sub_admin_forbidden(client: AsyncClient) -> None:
    token, _ = await _make_admin(client, role="sub_admin")
    resp = await client.get("/api/v1/admin/support-tickets", headers=_headers(token))
    assert resp.status_code == 403


async def test_client_forbidden(client: AsyncClient) -> None:
    client_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get("/api/v1/admin/support-tickets", headers=_headers(client_token))
    assert resp.status_code == 403


async def test_sub_admin_patch_forbidden(client: AsyncClient) -> None:
    """The GET/PATCH pair share require_admin, but the PATCH's own authz
    wasn't locked in by a test until now -- a future refactor that swapped
    the dependency on only one of the two routes would otherwise ship
    undetected."""
    token, _ = await _make_admin(client, role="sub_admin")
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid)

    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "in_progress"},
        headers=_headers(token),
    )
    assert resp.status_code == 403


async def test_client_patch_forbidden(client: AsyncClient) -> None:
    client_token, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid)

    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "in_progress"},
        headers=_headers(client_token),
    )
    assert resp.status_code == 403


async def test_admin_lists_all_tickets(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid)

    resp = await client.get("/api/v1/admin/support-tickets", headers=_headers(admin_token))
    assert resp.status_code == 200
    rows = {t["id"]: t for t in resp.json()["tickets"]}
    assert ticket_id in rows
    row = rows[ticket_id]
    assert row["status"] == "open"
    assert row["resolution_note"] is None
    assert row["requester_mobile"] == mobile


async def test_admin_filters_by_status(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    open_id = await _seed_ticket(requester_uid, status="open")
    closed_id = await _seed_ticket(requester_uid, status="closed")

    resp = await client.get(
        "/api/v1/admin/support-tickets", params={"status": "open"}, headers=_headers(admin_token)
    )
    assert resp.status_code == 200
    ids = {t["id"] for t in resp.json()["tickets"]}
    assert open_id in ids
    assert closed_id not in ids


async def test_soft_deleted_requester_resolves_to_none(client: AsyncClient) -> None:
    """Backend contract: a soft-deleted requester's name/mobile both resolve
    to None (not the tombstoned placeholder mobile) -- the frontend renders
    "Deleted account" for that case, same as apps/web/features/admin/
    payouts-view.tsx does for a delinked payout recipient."""
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid)

    import app.db.session as _session_mod
    from app.models.user import UserStatus

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE auth_users SET status = :s WHERE id = :id"),
            {"s": UserStatus.SOFT_DELETED.value, "id": requester_uid},
        )
        await db.commit()

    resp = await client.get("/api/v1/admin/support-tickets", headers=_headers(admin_token))
    row = next(t for t in resp.json()["tickets"] if t["id"] == ticket_id)
    assert row["requester_name"] is None
    assert row["requester_mobile"] is None


async def test_advance_open_to_in_progress_no_note_no_notification(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid)

    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "in_progress"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "in_progress"

    row = await _get_ticket_row(ticket_id)
    assert row["status"] == "in_progress"
    assert await _notification_count(requester_uid, "support_ticket_resolved") == 0


async def test_advance_to_resolved_with_note_notifies(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid, status="in_progress")

    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "resolved", "resolution_note": "Reset the password over WhatsApp."},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["resolution_note"] == "Reset the password over WhatsApp."

    row = await _get_ticket_row(ticket_id)
    assert row["status"] == "resolved"
    assert row["resolution_note"] == "Reset the password over WhatsApp."
    assert await _notification_count(requester_uid, "support_ticket_resolved") == 1


async def test_illegal_transition_returns_409(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid, status="open")

    # open -> resolved is not a legal direct transition (must pass through in_progress).
    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "resolved"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 409


async def test_closed_is_terminal(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid, status="closed")

    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "open"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 409


async def test_closed_reachable_directly_from_open(client: AsyncClient) -> None:
    """The manual-override escape hatch: closing a spam/duplicate ticket
    without ever moving it through in_progress/resolved."""
    admin_token, _ = await _make_admin(client)
    _, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid, status="open")

    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "closed"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200
    assert await _notification_count(requester_uid, "support_ticket_resolved") == 1


async def test_unknown_ticket_returns_404(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{uuid.uuid4()}",
        json={"status": "in_progress"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 404


async def test_resolution_note_never_in_client_own_ticket_view(client: AsyncClient) -> None:
    """The staff-only boundary this whole slice exists to hold: an internal
    note must never leak into the ticket author's own GET /tickets response."""
    admin_token, _ = await _make_admin(client)
    client_token, mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(requester_uid, status="open")

    await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "in_progress", "resolution_note": "internal: probably spam"},
        headers=_headers(admin_token),
    )

    own = await client.get("/api/v1/support-tickets/tickets", headers=_headers(client_token))
    assert own.status_code == 200
    row = next(t for t in own.json()["tickets"] if t["id"] == ticket_id)
    assert "resolution_note" not in row
    assert row["status"] == "in_progress"
