"""Offers — Sub Admin create/edit + lifecycle-advance (no Admin gate).

Every route runs on the request session under RLS (narrow sub_admin-only
allowlist — migration b5c6d7e8f9a0). Admin only gets the list/detail GET routes
(read-only oversight); there is no approve/reject or bypass service here at all.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user, require_sub_admin
from app.db.session import get_db
from app.models.offer import Offer, OfferStatus
from app.schemas.offers import OfferCreate, OfferListResponse, OfferRead, OfferUpdate
from app.services.offers import OfferIllegalTransition, OfferNotOwned, advance_offer

router = APIRouter()

_EDITABLE_STATUSES = (OfferStatus.DRAFT, OfferStatus.SCHEDULED)


@router.post("", response_model=OfferRead, status_code=status.HTTP_201_CREATED)
async def create_offer(
    payload: OfferCreate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    offer = Offer(created_by_uuid=current_user.id, **payload.model_dump())
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return OfferRead.model_validate(offer, from_attributes=True)


@router.get("", response_model=OfferListResponse)
async def list_offers(
    status_filter: OfferStatus | None = None,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> OfferListResponse:
    # RLS scopes the rows: sub_admin and admin see the shared queue, anyone else
    # sees nothing. Newest first.
    stmt = select(Offer).order_by(Offer.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(Offer.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return OfferListResponse(
        offers=[OfferRead.model_validate(r, from_attributes=True) for r in rows]
    )


@router.get("/{offer_id}", response_model=OfferRead)
async def get_offer(
    offer_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    offer = await db.scalar(select(Offer).where(Offer.id == offer_id))
    if offer is None:
        # 404, never 403: an RLS-filtered row is indistinguishable from missing.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    return OfferRead.model_validate(offer, from_attributes=True)


@router.patch("/{offer_id}", response_model=OfferRead)
async def update_offer(
    offer_id: UUID,
    payload: OfferUpdate,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    offer = await db.scalar(select(Offer).where(Offer.id == offer_id))
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    # App-layer guard, mirroring banners' update endpoint: sub_admin's shared-
    # visibility SELECT sees every offer, so ownership must be checked explicitly
    # rather than relying on a silent RLS zero-row no-op.
    if offer.created_by_uuid != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit offers you created.",
        )
    if offer.status not in _EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This offer cannot be edited from its current status.",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(offer, field, value)
    # OfferUpdate's own validator only sees fields present in THIS request, so a
    # partial PATCH (e.g. discount_value alone) can't check itself against an
    # unrelated existing discount_type — re-validate the merged row here.
    if offer.discount_type == "percentage" and offer.discount_value > 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="discount_value cannot exceed 100 for a percentage offer.",
        )
    await db.commit()
    await db.refresh(offer)
    return OfferRead.model_validate(offer, from_attributes=True)


async def _advance(
    offer_id: UUID, target: OfferStatus, current_user: CurrentUser, db: AsyncSession
) -> OfferRead:
    try:
        offer = await advance_offer(offer_id, current_user.id, target, db)
    except OfferNotOwned as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only advance offers you created.",
        ) from exc
    except OfferIllegalTransition as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This offer cannot move to that status from its current status.",
        ) from exc
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    return OfferRead.model_validate(offer, from_attributes=True)


@router.post("/{offer_id}/schedule", response_model=OfferRead)
async def schedule(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _advance(offer_id, OfferStatus.SCHEDULED, current_user, db)


@router.post("/{offer_id}/activate", response_model=OfferRead)
async def activate(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _advance(offer_id, OfferStatus.ACTIVE, current_user, db)


@router.post("/{offer_id}/archive", response_model=OfferRead)
async def archive(
    offer_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin),
    db: AsyncSession = Depends(get_db),
) -> OfferRead:
    return await _advance(offer_id, OfferStatus.ARCHIVED, current_user, db)
