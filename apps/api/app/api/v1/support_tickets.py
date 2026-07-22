"""Client support tickets — raise a ticket and list your own.

Identity-level (keyed on the account, not a business line). RLS (migration
3c4d5e6f7a8b) is the access boundary: a client sees only their own tickets,
platform Admin/Sub Admin see all. The client never supplies an owner field, the
router stamps auth_user_uuid from the authenticated identity, and the RLS
WITH CHECK enforces that the stamped owner matches the caller.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.notification import NotificationType
from app.models.support_ticket import SupportTicket
from app.schemas.support_tickets import (
    SupportTicketCreate,
    SupportTicketListResponse,
    SupportTicketRead,
)
from app.services.notifications import emit_notification

router = APIRouter()


@router.get("/tickets", response_model=SupportTicketListResponse)
async def list_tickets(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketListResponse:
    result = await db.execute(select(SupportTicket).order_by(SupportTicket.created_at.desc()))
    tickets = result.scalars().all()
    return SupportTicketListResponse(
        tickets=[SupportTicketRead.model_validate(t, from_attributes=True) for t in tickets]
    )


@router.post("/tickets", response_model=SupportTicketRead, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    req: SupportTicketCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketRead:
    ticket = SupportTicket(
        auth_user_uuid=current_user.id,
        category=req.category,
        subject=req.subject,
        body=req.body,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    await emit_notification(
        user_uuid=current_user.id,
        notification_type=NotificationType.SUPPORT_TICKET_RECEIVED,
        title="Support ticket received",
        body=f"We've received your ticket: {ticket.subject}. Our team will get back to you soon.",
        href="/dashboard/support",
    )
    return SupportTicketRead.model_validate(ticket, from_attributes=True)
