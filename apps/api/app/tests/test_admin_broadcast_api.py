"""Admin broadcast notifications (feature-status.md §3-12).

Covers: platform-admin-only gating, per-audience/business_line resolution,
soft-deleted exclusion, dual-line-client dedupe, audit-before-fanout
surviving a forced fanout failure, the per-admin rate limit, the cap, and
that preview never writes anything.

Runs in mock payment/push mode — no VAPID/RAZORPAY_* creds needed.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_access_token
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus
from app.models.user import User, UserStatus
from app.services.admin_notify import BroadcastAudience, broadcast, resolve_broadcast_recipients
from conftest import full_registration, unique_mobile

pytestmark = pytest.mark.asyncio


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


def _token(user_id: str, *, role: str = "admin", platform_scope: str = "true") -> str:
    return create_access_token(
        {"sub": user_id, "role": role, "business_line": "", "platform_scope": platform_scope}
    )


async def _make_admin(client: AsyncClient) -> tuple[str, str]:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _token(uid), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_client(business_line: str, *, auth_user_uuid: str | None = None) -> str:
    """Returns auth_user_uuid. Pass an existing one to add a SECOND line to
    the same identity (dual-line client, SRS §5.9)."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        if auth_user_uuid is None:
            user = User(
                first_name="Test",
                last_name="Client",
                mobile=unique_mobile(),
                email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
                password_hash="x",
            )
            db.add(user)
            await db.flush()
            uid = user.id
        else:
            uid = uuid.UUID(auth_user_uuid)
        db.add(
            ClientProfile(
                auth_user_uuid=uid,
                business_line=business_line,
                customer_code=f"CL{uuid.uuid4().hex[:8]}",
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()
        return str(uid)


async def test_broadcast_requires_platform_admin(client: AsyncClient) -> None:
    _, client_mobile = await full_registration(client, lines=["loans"])
    client_uid = await _auth_user_id(client_mobile)
    client_token = _token(client_uid, role="client", platform_scope="false")

    resp = await client.post(
        "/api/v1/notifications/broadcast",
        headers=_headers(client_token),
        json={"audience": "clients", "title": "t", "body": "b"},
    )
    assert resp.status_code == 403

    # Line-scoped sub_admin (platform_scope=false) must also be rejected —
    # broadcast reaches every matching user on the platform, stricter than
    # core.deps.require_admin's role-only check.
    line_sub_admin_token = _token(client_uid, role="sub_admin", platform_scope="false")
    resp2 = await client.post(
        "/api/v1/notifications/broadcast",
        headers=_headers(line_sub_admin_token),
        json={"audience": "clients", "title": "t", "body": "b"},
    )
    assert resp2.status_code == 403


async def test_resolve_recipients_filters_by_business_line(client: AsyncClient) -> None:
    loans_uid = await _seed_client("loans")
    re_uid = await _seed_client("real_estate")

    recipients = await resolve_broadcast_recipients(
        audience=BroadcastAudience.CLIENTS, business_line="loans"
    )

    assert uuid.UUID(loans_uid) in recipients
    assert uuid.UUID(re_uid) not in recipients


async def test_resolve_recipients_excludes_soft_deleted(client: AsyncClient) -> None:
    import app.db.session as _session_mod

    uid = await _seed_client("loans")
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE auth_users SET status = :s WHERE id = :id"),
            {"s": UserStatus.SOFT_DELETED.value, "id": uid},
        )
        await db.commit()

    recipients = await resolve_broadcast_recipients(
        audience=BroadcastAudience.CLIENTS, business_line="loans"
    )
    assert uuid.UUID(uid) not in recipients


async def test_broadcast_dedupes_dual_line_client_to_one_notification(
    client: AsyncClient,
) -> None:
    """A dual-line client holds TWO client_profiles rows (SRS §5.9) — a naive
    per-row fan-out would double-notify; the set-based resolution must not."""
    import app.db.session as _session_mod

    admin_token, admin_uid = await _make_admin(client)
    loans_uid = await _seed_client("loans")
    await _seed_client("real_estate", auth_user_uuid=loans_uid)

    title = f"dedupe-{uuid.uuid4().hex[:8]}"
    async with _session_mod.AsyncSessionLocal() as db:
        await broadcast(
            db,
            audience=BroadcastAudience.CLIENTS,
            business_line=None,
            title=title,
            body="x",
            href=None,
            actor_uuid=uuid.UUID(admin_uid),
            actor_role="admin",
        )

    async with _session_mod.AsyncSessionLocal() as db:
        count = await db.scalar(
            text("SELECT count(*) FROM notifications WHERE title = :title AND user_uuid = :uid"),
            {"title": title, "uid": loans_uid},
        )
    assert count == 1


async def test_broadcast_audits_before_fanout_and_survives_fanout_failure(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.db.session as _session_mod
    import app.services.admin_notify as admin_notify_module

    admin_token, admin_uid = await _make_admin(client)
    await _seed_client("loans")
    title = f"survive-{uuid.uuid4().hex[:8]}"

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated fanout failure")

    # Fails only the fanout half (the bulk Notification insert, which runs
    # AFTER the audit row's own db.commit() on the caller's session) — the
    # audience resolution and the audit write must both already be done by
    # the time this can even be reached.
    monkeypatch.setattr(admin_notify_module, "Notification", _boom)

    async with _session_mod.AsyncSessionLocal() as db:
        # broadcast() itself swallows the fanout exception (best-effort) —
        # must not raise.
        recipients = await broadcast(
            db,
            audience=BroadcastAudience.CLIENTS,
            business_line="loans",
            title=title,
            body="x",
            href=None,
            actor_uuid=uuid.UUID(admin_uid),
            actor_role="admin",
        )
    assert recipients >= 1  # resolution itself succeeded

    monkeypatch.undo()

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT actor_uuid FROM audit_log WHERE action = 'notification_broadcast' "
                    "AND detail ->> 'title' = :title"
                ),
                {"title": title},
            )
        ).fetchone()
        notified = await db.scalar(
            text("SELECT count(*) FROM notifications WHERE title = :title"), {"title": title}
        )
    assert row is not None, "audit row must survive even though the fanout itself blew up"
    assert str(row.actor_uuid) == admin_uid
    assert notified == 0, "the fanout genuinely failed — no notification rows should exist"


async def test_broadcast_rate_limited_on_second_call(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    body = {"audience": "agents", "title": "t1", "body": "b1"}

    first = await client.post(
        "/api/v1/notifications/broadcast", headers=_headers(admin_token), json=body
    )
    assert first.status_code == 200

    second = await client.post(
        "/api/v1/notifications/broadcast",
        headers=_headers(admin_token),
        json={"audience": "agents", "title": "t2", "body": "b2"},
    )
    assert second.status_code == 429


async def test_broadcast_cap_exceeded_returns_400(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin_token, admin_uid = await _make_admin(client)
    await _seed_client("loans")
    monkeypatch.setattr(settings, "ADMIN_BROADCAST_MAX_RECIPIENTS", 0)

    resp = await client.post(
        "/api/v1/notifications/broadcast",
        headers=_headers(admin_token),
        json={"audience": "clients", "business_line": "loans", "title": "t", "body": "b"},
    )
    assert resp.status_code == 400


async def test_broadcast_preview_does_not_send(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    target_uid = await _seed_client("loans")

    resp = await client.get(
        "/api/v1/notifications/broadcast/preview",
        headers=_headers(admin_token),
        params={"audience": "clients", "business_line": "loans"},
    )
    assert resp.status_code == 200
    assert resp.json()["recipients"] >= 1

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        count = await db.scalar(
            text("SELECT count(*) FROM notifications WHERE user_uuid = :uid"),
            {"uid": target_uid},
        )
    assert count == 0


async def test_agent_broadcast_resolution(client: AsyncClient) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"ag_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        db.add(
            AgentProfile(
                auth_user_uuid=user.id,
                agent_code=f"AG-{uuid.uuid4().hex[:8]}",
                business_line="real_estate",
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()
        agent_uid = user.id

    recipients = await resolve_broadcast_recipients(
        audience=BroadcastAudience.AGENTS, business_line="real_estate"
    )
    assert agent_uid in recipients

    loans_only = await resolve_broadcast_recipients(
        audience=BroadcastAudience.AGENTS, business_line="loans"
    )
    assert agent_uid not in loans_only
