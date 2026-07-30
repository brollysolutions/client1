"""Client-facing property deals (/api/v1/property-deals/*).

GET endpoints only: RLS (migration d6e7f8a9b0c1) is the real access boundary —
a client's own deals, a real-estate line staff member's own line, or
Admin/Sub Admin (platform_scope) — this layer just authenticates and shapes
the response. No client-writable Create here: deal creation is telecaller-only
(see api/v1/telecaller.py), unlike loans' client self-service Apply. No
consuming client UI ships this slice either — this exists so the
property_deal_status_updated notification's href doesn't dead-end, and so the
identity-safe RLS branch (a both-line client seeing their own real-estate
deal) is exercised end-to-end.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.property_deal import PropertyDeal
from app.schemas.property_deals import (
    AgentContactRead,
    PropertyDealListResponse,
    PropertyDealRead,
)
from app.services.contacts import get_my_agent

router = APIRouter()


@router.get("/agent", response_model=AgentContactRead | None)
async def get_my_agent_contact(
    current_user: CurrentUser = Depends(get_active_user),
) -> AgentContactRead | None:
    """Null is the "no agent assigned yet" state, not an error -- a client
    with no property deal yet, or one whose lead has no origin agent, has no
    agent to show. Name + agent_code only -- contact routes through the
    support-ticket flow."""
    contact = await get_my_agent(current_user.id)
    if contact is None:
        return None
    return AgentContactRead(name=contact.name, agent_code=contact.agent_code)


@router.get("", response_model=PropertyDealListResponse)
async def list_property_deals(
    current_user: CurrentUser = Depends(get_active_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> PropertyDealListResponse:
    result = await db.execute(
        select(PropertyDeal)
        .options(joinedload(PropertyDeal.property))
        .order_by(PropertyDeal.opened_at.desc())
    )
    deals = result.scalars().all()
    return PropertyDealListResponse(
        deals=[PropertyDealRead.model_validate(d, from_attributes=True) for d in deals]
    )


@router.get("/{deal_id}", response_model=PropertyDealRead)
async def get_property_deal(
    deal_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> PropertyDealRead:
    result = await db.execute(
        select(PropertyDeal)
        .options(joinedload(PropertyDeal.property))
        .where(PropertyDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    if deal is None:
        # RLS already filters rows outside the caller's access; a miss here is
        # indistinguishable from "does not exist" and must read that way too.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Property deal not found."
        )
    return PropertyDealRead.model_validate(deal, from_attributes=True)
