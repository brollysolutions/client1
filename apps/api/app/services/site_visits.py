"""Site visit business logic — status-transition rules live here, not in RLS.

RLS (migration 9c1d2e3f4a5b) already scopes which rows a caller can see/touch;
this module only decides what a fetched row is allowed to become next.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser
from app.models.notification import NotificationType
from app.models.site_visit import SiteVisit, SiteVisitStatus
from app.services.notifications import emit_notification

_TERMINAL_STATUSES = {SiteVisitStatus.DONE, SiteVisitStatus.CANCELLED}


async def cancel_site_visit(
    db: AsyncSession,
    visit_id: UUID,
    current_user: CurrentUser,  # noqa: ARG001 - unused: RLS, not this arg, scopes visibility
) -> SiteVisit:
    result = await db.execute(select(SiteVisit).where(SiteVisit.id == visit_id))
    visit = result.scalar_one_or_none()
    if visit is None:
        # RLS already filters rows outside the caller's access; a miss here is
        # indistinguishable from "does not exist" and must read that way too —
        # never 403 (existence must not leak), mirroring get_loan_application.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site visit not found.")

    if visit.status in _TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This site visit can no longer be cancelled.",
        )

    visit.status = SiteVisitStatus.CANCELLED
    visit.cancelled_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(visit)
    await emit_notification(
        user_uuid=visit.user_uuid,
        notification_type=NotificationType.SITE_VISIT_CANCELLED,
        title="Site visit cancelled",
        body=f"Your visit to {visit.title} has been cancelled.",
        href="/dashboard/site-visits",
    )
    return visit
