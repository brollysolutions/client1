"""services/push.py — _is_live all-or-nothing behavior, and 404/410 pruning.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from pywebpush import WebPushException

from app.core.config import settings
from app.models.push_subscription import PushSubscription
from app.services import push
from conftest import full_registration


@pytest.fixture(autouse=True)
def _allow_existing_test_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        settings,
        "PUSH_ENDPOINT_ALLOWED_HOSTS",
        f"{settings.PUSH_ENDPOINT_ALLOWED_HOSTS},push.example.com",
    )


def _go_live(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "test-public-key")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "test-private-key")
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:ops@example.com")
    assert push._is_live() is True


async def _auth_user_uuid(mobile: str) -> str:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _seed_subscription(user_uuid: str, endpoint: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        subscription = PushSubscription(
            user_uuid=uuid.UUID(user_uuid),
            endpoint=endpoint,
            p256dh="p256dh-key",
            auth="auth-secret",
        )
        db.add(subscription)
        await db.commit()
        await db.refresh(subscription)
        return str(subscription.id)


async def _subscription_exists(subscription_id: str) -> bool:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT 1 FROM push_subscriptions WHERE id = :i"), {"i": subscription_id}
            )
        ).fetchone()
        return row is not None


def test_is_live_false_with_no_credentials() -> None:
    assert push._is_live() is False


def test_is_live_requires_all_three(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "only-public")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "")
    assert push._is_live() is False


@pytest.mark.asyncio
async def test_send_to_user_prunes_subscription_on_410(client: AsyncClient, monkeypatch) -> None:
    """The push service reports the subscription gone (410) -> row is deleted,
    and send_to_user itself never raises (best-effort)."""
    _go_live(monkeypatch)
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    subscription_id = await _seed_subscription(uid, f"https://push.example.com/{uuid.uuid4().hex}")

    def _raise_gone(*args, **kwargs):
        raise WebPushException("gone", response=_FakeResponse(410))

    monkeypatch.setattr(push, "webpush", _raise_gone)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await push.send_to_user(db, user_uuid=uuid.UUID(uid), title="Hi", body="Body", href=None)

    assert await _subscription_exists(subscription_id) is False


@pytest.mark.asyncio
async def test_send_to_user_keeps_subscription_on_other_error(
    client: AsyncClient, monkeypatch
) -> None:
    """A non-404/410 failure (e.g. a transient 500) is logged and swallowed,
    but the subscription is NOT pruned — it might still be good."""
    _go_live(monkeypatch)
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    subscription_id = await _seed_subscription(uid, f"https://push.example.com/{uuid.uuid4().hex}")

    def _raise_server_error(*args, **kwargs):
        raise WebPushException("server error", response=_FakeResponse(500))

    monkeypatch.setattr(push, "webpush", _raise_server_error)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await push.send_to_user(db, user_uuid=uuid.UUID(uid), title="Hi", body="Body", href=None)

    assert await _subscription_exists(subscription_id) is True


@pytest.mark.asyncio
async def test_send_to_user_prunes_legacy_unsafe_endpoint_without_request(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _go_live(monkeypatch)
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    subscription_id = await _seed_subscription(uid, "http://127.0.0.1/internal-admin")
    calls: list[str] = []

    def _unexpected_webpush(*args, **kwargs):
        calls.append("called")

    monkeypatch.setattr(push, "webpush", _unexpected_webpush)
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await push.send_to_user(db, user_uuid=uuid.UUID(uid), title="Hi", body="Body", href=None)

    assert calls == []
    assert await _subscription_exists(subscription_id) is False


def test_no_redirect_session_forces_redirects_off(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def _fake_post(self, url, **kwargs):
        captured.update(kwargs)
        return object()

    import requests

    monkeypatch.setattr(requests.Session, "post", _fake_post)
    with push._NoRedirectSession() as session:
        session.post("https://fcm.googleapis.com/fcm/send/test", allow_redirects=True)

    assert captured["allow_redirects"] is False


class _FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
