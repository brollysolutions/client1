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
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser
from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.models.site_visit import SiteVisit, SiteVisitStatus
from app.models.vehicle_arrangement import VehicleArrangement, VehicleArrangementStatus
from app.schemas.site_visits import SiteVisitCreate
from app.services.audit_log import record
from app.services.notifications import emit_notification

_TERMINAL_STATUSES = {SiteVisitStatus.DONE, SiteVisitStatus.CANCELLED}


async def list_site_visits(db: AsyncSession) -> list[SiteVisit]:
    result = await db.execute(
        select(SiteVisit)
        .options(selectinload(SiteVisit.vehicle_arrangement))
        .order_by(SiteVisit.created_at.desc())
    )
    return list(result.scalars().all())


async def create_site_visit(
    db: AsyncSession, payload: SiteVisitCreate, current_user: CurrentUser
) -> SiteVisit:
    visit = SiteVisit(
        user_uuid=current_user.id,
        business_line="real_estate",
        property_ref=payload.property_ref,
        title=payload.title,
        locality=payload.locality,
        city=payload.city,
        contact_name=payload.contact_name,
        contact_mobile=payload.contact_mobile,
        preferred_date=payload.preferred_date,
        preferred_time_slot=payload.preferred_time_slot,
        message=payload.message,
    )
    db.add(visit)
    await db.flush()
    if payload.pickup_requested:
        visit.vehicle_arrangement = VehicleArrangement(
            site_visit_uuid=visit.id,
            business_line="real_estate",
            pickup_location=payload.pickup_location,
            pickup_at=payload.pickup_at,
        )
    await db.commit()
    await db.refresh(visit)
    await db.refresh(visit, attribute_names=["vehicle_arrangement"])
    return visit


async def cancel_site_visit(
    db: AsyncSession,
    visit_id: UUID,
    current_user: CurrentUser,  # noqa: ARG001 - unused: RLS, not this arg, scopes visibility
) -> SiteVisit:
    result = await db.execute(
        select(SiteVisit)
        .options(selectinload(SiteVisit.vehicle_arrangement))
        .where(SiteVisit.id == visit_id)
        .with_for_update()
    )
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
    active_arrangement = (
        visit.vehicle_arrangement is not None
        and visit.vehicle_arrangement.status
        not in {VehicleArrangementStatus.COMPLETED, VehicleArrangementStatus.CANCELLED}
    )
    await db.flush()
    if active_arrangement:
        await record(
            db,
            action=AuditAction.VEHICLE_ARRANGEMENT_UPDATED,
            entity_type="vehicle_arrangement",
            entity_uuid=visit.vehicle_arrangement.id,
            actor_uuid=current_user.id,
            actor_role=current_user.role,
            business_line="real_estate",
            detail={
                "from_status": visit.vehicle_arrangement.status.value,
                "to_status": VehicleArrangementStatus.CANCELLED.value,
                "source": "site_visit_cancelled",
            },
        )
    await db.commit()
    await db.refresh(visit)
    await db.refresh(visit, attribute_names=["vehicle_arrangement"])
    if visit.vehicle_arrangement is not None:
        await db.refresh(visit.vehicle_arrangement)
    await emit_notification(
        user_uuid=visit.user_uuid,
        notification_type=NotificationType.SITE_VISIT_CANCELLED,
        title="Site visit cancelled",
        body="Your site visit has been cancelled.",
        href="/dashboard/site-visits",
    )
    return visit
