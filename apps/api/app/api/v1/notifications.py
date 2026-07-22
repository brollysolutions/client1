"""Client notification feed — list own, unread count, mark read / read-all.

Identity-level (migration 6f7a8b9c1d2e): RLS scopes rows to the recipient
(app.auth_user_uuid) or platform_scope. There is no create endpoint here —
only the internal emit_notification helper (services/notifications.py)
writes rows, from a bypass session, hooked into site-visit and
support-ticket creation/cancellation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.notification import Notification
from app.schemas.notifications import (
    NotificationListResponse,
    NotificationRead,
    UnreadCountResponse,
)

router = APIRouter()

# Defensive cap, not a pagination feature: keeps the unpaginated feed payload
# bounded as an account accumulates events over time.
_LIST_LIMIT = 100


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
    result = await db.execute(
        select(Notification).order_by(Notification.created_at.desc()).limit(_LIST_LIMIT)
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
        select(func.count()).select_from(Notification).where(Notification.read_at.is_(None))
    )
    return UnreadCountResponse(count=result.scalar_one())


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationRead:
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()
    if notification is None:
        # RLS already filters rows outside the caller's access; a miss here is
        # indistinguishable from "does not exist" (never leak existence).
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
    # RLS's USING clause already scopes this UPDATE to the caller's own rows
    # (or all rows for platform_scope) — no explicit user_uuid filter needed.
    await db.execute(
        update(Notification).where(Notification.read_at.is_(None)).values(read_at=datetime.now(UTC))
    )
    await db.commit()
