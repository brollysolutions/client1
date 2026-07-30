"""Client notification feed — list own, unread count, mark read / read-all.

Identity-level (migration 6f7a8b9c1d2e; bypass narrowed to admin-only by
a0b1c2d3e4f5): every query below carries an explicit `user_uuid ==
current_user.id` predicate, so no role — admin included — can read or mutate
another user's notifications through this router. RLS is defence-in-depth,
not the sole wall, since notifications is one of only two tables where
api_user holds UPDATE. There is no create endpoint here — only the internal
emit_notification helper (services/notifications.py) writes rows, from a
bypass session, hooked into site-visit and support-ticket creation/cancellation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import ADMIN_BROADCAST_RATE, RedisCache
from app.core.config import settings
from app.core.deps import CurrentUser, get_active_user, get_cache
from app.db.session import get_db
from app.models.notification import Notification
from app.schemas.notifications import (
    BroadcastPreviewResponse,
    BroadcastRequest,
    BroadcastResponse,
    NotificationListResponse,
    NotificationRead,
    UnreadCountResponse,
)
from app.services.admin_notify import (
    BroadcastAudience,
    BroadcastTooLarge,
    broadcast,
    resolve_broadcast_recipients,
)

router = APIRouter()


def _require_admin(current_user: CurrentUser) -> None:
    """Full-Admin-only, platform-scoped — a broadcast reaches every matching
    user on the platform, so this is deliberately stricter than
    core.deps.require_admin (role-only, no platform_scope check)."""
    if current_user.role != "admin" or current_user.platform_scope != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Broadcasting is restricted to platform admins.",
        )


# Defensive cap, not a pagination feature: keeps the unpaginated feed payload
# bounded as an account accumulates events over time.
_LIST_LIMIT = 100


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
    result = await db.execute(
        select(Notification)
        .where(Notification.user_uuid == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(_LIST_LIMIT)
    )
    notifications = result.scalars().all()
    return NotificationListResponse(
        notifications=[
            NotificationRead.model_validate(n, from_attributes=True) for n in notifications
        ]
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountResponse:
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_uuid == current_user.id,
            Notification.read_at.is_(None),
        )
    )
    return UnreadCountResponse(count=result.scalar_one())


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationRead:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_uuid == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        # Another user's notification is indistinguishable from "does not
        # exist" (never leak existence).
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(notification)
    return NotificationRead.model_validate(notification, from_attributes=True)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.execute(
        update(Notification)
        .where(
            Notification.user_uuid == current_user.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await db.commit()


@router.get("/broadcast/preview", response_model=BroadcastPreviewResponse)
async def preview_broadcast(
    audience: str,
    business_line: str | None = None,
    current_user: CurrentUser = Depends(get_active_user),
) -> BroadcastPreviewResponse:
    """Dry run: resolves and counts the audience without sending anything.
    A broadcast is unretractable (no delete endpoint exists, and none should
    be added), so an admin should see "this reaches N people" before
    committing to a send."""
    _require_admin(current_user)
    recipients = await resolve_broadcast_recipients(
        audience=BroadcastAudience(audience), business_line=business_line
    )
    return BroadcastPreviewResponse(recipients=len(recipients))


@router.post("/broadcast", response_model=BroadcastResponse)
async def send_broadcast(
    req: BroadcastRequest,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> BroadcastResponse:
    _require_admin(current_user)

    rate_key = ADMIN_BROADCAST_RATE.format(admin_uuid=current_user.id)
    if await cache.exists(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Only one broadcast per admin every "
            f"{settings.ADMIN_BROADCAST_RATE_LIMIT_MINUTES} minutes — "
            "a broadcast cannot be undone.",
        )
    # Claimed BEFORE the send, not after: two concurrent double-clicks must
    # not both slip through while the first send is still in flight.
    await cache.set(rate_key, 1, settings.ADMIN_BROADCAST_RATE_LIMIT_MINUTES * 60)

    try:
        recipients = await broadcast(
            db,
            audience=req.audience,
            business_line=req.business_line,
            title=req.title,
            body=req.body,
            href=req.href,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
        )
    except BroadcastTooLarge as exc:
        await cache.delete(rate_key)  # never sent — the claim above was premature
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Audience of {exc.count} exceeds the "
            f"{settings.ADMIN_BROADCAST_MAX_RECIPIENTS}-recipient cap.",
        ) from exc

    return BroadcastResponse(recipients=recipients)
