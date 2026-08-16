"""Web push delivery — sends a browser push for a notification, best-effort.

Called inline from services.notifications.emit_notification (not via an
outbox table + scheduler job): that producer already has exactly the right
contract for this — best-effort, never blocks the triggering business action
— and event volume here is low (7 notification types, not high-throughput).
An outbox would duplicate that contract in a second place and add delivery
latency for no real benefit at this volume.

Live-vs-mock is switched by credential presence alone, exactly like
services/payments.py: empty VAPID_* settings ⇒ _is_live() is False ⇒
send_to_user is never even called (see emit_notification), so this module
makes no outbound HTTP call at all in mock mode.

pywebpush is sync (built on `requests`), so the actual send is offloaded to a
worker thread via anyio.to_thread — same idiom as argon2 hashing in
app.core.security (ARGON2_LIMITER), which exists for the same reason: don't
block the event loop with a blocking call, and cap concurrent thread usage.

upsert_subscription/delete_subscription run on the bypass AsyncSessionLocal
session (the 'app' superuser, same mechanism as
services.notifications.emit_notification), NOT the caller's own RLS-scoped
request session. This is a correctness requirement, not a style choice: a
shared/reused browser hands back the SAME push endpoint across different
logged-in accounts (browsers return the existing subscription for a given
origin + applicationServerKey), so re-subscribing must be able to reassign a
row from user A to user B. push_subscriptions' RLS USING clause is
owner-only with no admin/cross-user bypass branch (deliberately, see
models/push_subscription.py), so user B's own RLS-scoped session can never
even see user A's existing row to update it — an upsert attempted on that
session hits "new row violates row-level security policy". The bypass
session sidesteps RLS entirely for this write, exactly like emit_notification
does for its own future cross-user producer case; correctness for THIS
session's own subscription is instead enforced by the route only ever
passing the JWT-derived current_user.id, never a client-supplied user id.
"""

from __future__ import annotations

import json
import logging
import uuid

import anyio
import requests
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.push_endpoints import InvalidPushEndpoint, validate_push_endpoint
from app.db.session import AsyncSessionLocal
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

# Mirrors ARGON2_LIMITER's reasoning (app.core.security): bound concurrent
# blocking-thread usage so a burst of notifications can't spawn unbounded
# worker threads.
PUSH_LIMITER = anyio.CapacityLimiter(8)


class _NoRedirectSession(requests.Session):
    """Web Push delivery must never follow a provider redirect to another host."""

    def post(self, url: str, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["allow_redirects"] = False
        return super().post(url, **kwargs)


def _is_live() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY and settings.VAPID_SUBJECT)


async def get_vapid_public_key() -> str:
    return settings.VAPID_PUBLIC_KEY


async def upsert_subscription(
    *, user_uuid: uuid.UUID, endpoint: str, p256dh: str, auth: str
) -> None:
    """Upserts on `endpoint` alone: a shared/reused browser returns the SAME
    endpoint across different logged-in accounts, so re-subscribing must
    reassign ownership, not collide. Runs on the bypass session — see module
    docstring for why the caller's own RLS-scoped session cannot do this."""
    validate_push_endpoint(endpoint)
    async with AsyncSessionLocal() as session:
        stmt = pg_insert(PushSubscription).values(
            user_uuid=user_uuid,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[PushSubscription.endpoint],
            set_={
                "user_uuid": stmt.excluded.user_uuid,
                "p256dh": stmt.excluded.p256dh,
                "auth": stmt.excluded.auth,
            },
        )
        await session.execute(stmt)
        await session.commit()


async def delete_subscription(*, user_uuid: uuid.UUID, endpoint: str) -> None:
    """Explicit user_uuid predicate: a stale tab from a previous owner of
    this endpoint (shared-browser reassignment case) must not be able to
    delete the current owner's live subscription. Runs on the bypass session,
    same reasoning as upsert_subscription."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(PushSubscription).where(
                PushSubscription.endpoint == endpoint,
                PushSubscription.user_uuid == user_uuid,
            )
        )
        await session.commit()


async def send_to_user(
    session: AsyncSession, *, user_uuid: uuid.UUID, title: str, body: str, href: str | None
) -> None:
    """Called from emit_notification on its existing bypass session, after
    the notification row commits. Fans out to every subscription this user
    has (multi-device); each send is isolated so one dead browser never
    blocks delivery to the user's other browsers."""
    result = await session.execute(
        select(PushSubscription).where(PushSubscription.user_uuid == user_uuid)
    )
    subscriptions = result.scalars().all()
    payload = json.dumps({"title": title, "body": body, "href": href})
    for subscription in subscriptions:
        try:
            validate_push_endpoint(subscription.endpoint)
        except InvalidPushEndpoint:
            # Prune legacy/directly-seeded unsafe rows without making an
            # outbound request or retrying them on every notification.
            await session.execute(
                delete(PushSubscription).where(PushSubscription.id == subscription.id)
            )
            await session.commit()
            logger.warning(
                "push.invalid_endpoint_pruned user_uuid=%s subscription_id=%s",
                user_uuid,
                subscription.id,
            )
            continue
        try:
            await _send_one(session, subscription, payload)
        except Exception:
            logger.warning(
                "push.send_failed user_uuid=%s subscription_id=%s",
                user_uuid,
                subscription.id,
                exc_info=True,
            )


async def _send_one(session: AsyncSession, subscription: PushSubscription, payload: str) -> None:
    def _send() -> None:
        # A fresh session avoids cross-thread mutable state. Redirects are
        # disabled so an approved provider cannot bounce this server to an
        # arbitrary internal URL; the explicit timeout replaces pywebpush's
        # unsafe 10,000-second default.
        with _NoRedirectSession() as requests_session:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
                timeout=settings.PUSH_DELIVERY_TIMEOUT_SECONDS,
                requests_session=requests_session,
            )

    try:
        await anyio.to_thread.run_sync(_send, limiter=PUSH_LIMITER)
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code in (404, 410):
            # Standard Web Push pruning: the push service says this
            # subscription is gone (browser uninstalled / permission
            # revoked at the OS level without ever coming back to us).
            await session.execute(
                delete(PushSubscription).where(PushSubscription.id == subscription.id)
            )
            await session.commit()
        else:
            raise
