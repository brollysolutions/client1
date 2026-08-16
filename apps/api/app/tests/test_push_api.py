"""/api/v1/push — vapid-public-key, subscribe, unsubscribe.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import settings
from conftest import full_registration


@pytest.fixture(autouse=True)
def _allow_existing_test_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        settings,
        "PUSH_ENDPOINT_ALLOWED_HOSTS",
        f"{settings.PUSH_ENDPOINT_ALLOWED_HOSTS},push.example.com",
    )


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _subscription_owner(endpoint: str) -> str | None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT user_uuid FROM push_subscriptions WHERE endpoint = :e"),
                {"e": endpoint},
            )
        ).fetchone()
        return str(row[0]) if row else None


async def _subscription_count_for(user_uuid: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return await db.scalar(
            text("SELECT count(*) FROM push_subscriptions WHERE user_uuid = :u"),
            {"u": user_uuid},
        )


@pytest.mark.asyncio
async def test_vapid_public_key_requires_no_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/push/vapid-public-key")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_vapid_public_key_empty_in_mock_mode(client: AsyncClient) -> None:
    """No VAPID settings configured on the test stack ⇒ inert by default."""
    assert settings.VAPID_PUBLIC_KEY == ""
    resp = await client.get("/api/v1/push/vapid-public-key")
    assert resp.json() == {"public_key": ""}


@pytest.mark.asyncio
async def test_subscribe_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/push/subscribe",
        json={"endpoint": "https://push.example.com/e1", "p256dh": "k", "auth": "a"},
    )
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://127.0.0.1/internal",
        "https://127.0.0.1/internal",
        "https://localhost/internal",
        "https://169.254.169.254/latest/meta-data",
        "https://fcm.googleapis.com.evil.example/push",
        "https://example.com/push",
    ],
)
async def test_subscribe_rejects_ssrf_and_unapproved_endpoints(
    client: AsyncClient, endpoint: str
) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    resp = await client.post(
        "/api/v1/push/subscribe",
        headers={"Authorization": f"Bearer {token}"},
        json={"endpoint": endpoint, "p256dh": "key", "auth": "secret"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unsubscribe_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/push/unsubscribe", json={"endpoint": "https://push.example.com/e1"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_subscribe_creates_row_scoped_to_caller(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    endpoint = f"https://fcm.googleapis.com/fcm/send/{uuid.uuid4().hex}"

    resp = await client.post(
        "/api/v1/push/subscribe",
        headers={"Authorization": f"Bearer {token}"},
        json={"endpoint": endpoint, "p256dh": "key", "auth": "secret"},
    )
    assert resp.status_code == 204
    assert await _subscription_owner(endpoint) == uid


@pytest.mark.asyncio
async def test_resubscribing_same_endpoint_upserts_not_duplicates(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    endpoint = f"https://push.example.com/{uuid.uuid4().hex}"
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/push/subscribe",
        headers=headers,
        json={"endpoint": endpoint, "p256dh": "key-1", "auth": "secret-1"},
    )
    resp = await client.post(
        "/api/v1/push/subscribe",
        headers=headers,
        json={"endpoint": endpoint, "p256dh": "key-2", "auth": "secret-2"},
    )
    assert resp.status_code == 204
    assert await _subscription_count_for(uid) == 1


@pytest.mark.asyncio
async def test_resubscribing_endpoint_from_different_user_reassigns_ownership(
    client: AsyncClient,
) -> None:
    """Shared/reused browser: the browser hands back the SAME endpoint for a
    different logged-in account. Re-subscribing must reassign ownership, the
    correct behavior for a browser that can only deliver to one owner."""
    token_a, mobile_a = await full_registration(client, lines=["real_estate"])
    token_b, mobile_b = await full_registration(client, lines=["real_estate"])
    uid_a = await _auth_user_uuid(mobile_a)
    uid_b = await _auth_user_uuid(mobile_b)
    endpoint = f"https://push.example.com/{uuid.uuid4().hex}"

    await client.post(
        "/api/v1/push/subscribe",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"endpoint": endpoint, "p256dh": "key", "auth": "secret"},
    )
    assert await _subscription_owner(endpoint) == uid_a

    resp = await client.post(
        "/api/v1/push/subscribe",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"endpoint": endpoint, "p256dh": "key", "auth": "secret"},
    )
    assert resp.status_code == 204
    assert await _subscription_owner(endpoint) == uid_b
    assert await _subscription_count_for(uid_a) == 0


@pytest.mark.asyncio
async def test_unsubscribe_deletes_only_callers_own_row(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    endpoint = f"https://push.example.com/{uuid.uuid4().hex}"
    headers = {"Authorization": f"Bearer {token}"}
    await client.post(
        "/api/v1/push/subscribe",
        headers=headers,
        json={"endpoint": endpoint, "p256dh": "key", "auth": "secret"},
    )

    resp = await client.post(
        "/api/v1/push/unsubscribe", headers=headers, json={"endpoint": endpoint}
    )
    assert resp.status_code == 204
    assert await _subscription_owner(endpoint) is None
    assert uid  # sanity: uid was resolvable


@pytest.mark.asyncio
async def test_unsubscribe_is_noop_for_unknown_or_other_users_endpoint(
    client: AsyncClient,
) -> None:
    owner_token, owner_mobile = await full_registration(client, lines=["real_estate"])
    other_token, _ = await full_registration(client, lines=["real_estate"])
    endpoint = f"https://push.example.com/{uuid.uuid4().hex}"
    await client.post(
        "/api/v1/push/subscribe",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"endpoint": endpoint, "p256dh": "key", "auth": "secret"},
    )

    # A different user's unsubscribe call against the owner's endpoint is a
    # silent no-op (no existence leak, and protects against the stale-tab /
    # shared-browser reassignment edge case).
    resp = await client.post(
        "/api/v1/push/unsubscribe",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"endpoint": endpoint},
    )
    assert resp.status_code == 204
    owner_uid = await _auth_user_uuid(owner_mobile)
    assert await _subscription_owner(endpoint) == owner_uid  # untouched

    # An entirely unknown endpoint is also a no-op 204.
    resp = await client.post(
        "/api/v1/push/unsubscribe",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"endpoint": f"https://push.example.com/{uuid.uuid4().hex}"},
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_support_ticket_producer_calls_webpush_and_survives_its_failure(
    client: AsyncClient, monkeypatch
) -> None:
    """End-to-end through the real producer: with VAPID configured live and a
    subscription on file, creating a support ticket (one of the 7 existing
    notification events) triggers a push send. If pywebpush raises, ticket
    creation must still succeed (best-effort, matches notification-write
    failure handling)."""
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "test-public-key")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "test-private-key")
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:ops@example.com")

    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    endpoint = f"https://push.example.com/{uuid.uuid4().hex}"
    await client.post(
        "/api/v1/push/subscribe",
        headers=headers,
        json={"endpoint": endpoint, "p256dh": "key", "auth": "secret"},
    )

    calls: list[dict] = []

    def _fake_webpush(
        *,
        subscription_info,
        data,
        vapid_private_key,
        vapid_claims,
        timeout,
        requests_session,
    ):
        calls.append({"endpoint": subscription_info["endpoint"], "data": data})
        assert timeout == settings.PUSH_DELIVERY_TIMEOUT_SECONDS
        assert requests_session is not None
        raise RuntimeError("simulated push-service outage")

    from app.services import push as push_module

    monkeypatch.setattr(push_module, "webpush", _fake_webpush)

    resp = await client.post(
        "/api/v1/support-tickets/tickets",
        headers=headers,
        json={"category": "general", "subject": "Help", "body": "I need help with my account."},
    )
    assert resp.status_code in (200, 201)
    assert len(calls) == 1
    assert calls[0]["endpoint"] == endpoint

    # The notification itself must still have been written despite the
    # simulated push outage.
    listed = await client.get("/api/v1/notifications", headers=headers)
    assert len(listed.json()["notifications"]) == 1
