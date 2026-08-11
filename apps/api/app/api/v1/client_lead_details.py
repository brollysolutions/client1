"""Client-owned journey-detail read/update endpoints (FR-2.8)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.schemas.lead_details import LeadDetailsPatch, LeadDetailsRead
from app.services.lead_details import (
    DetailActor,
    LeadDetailsForbidden,
    LeadDetailsLocked,
    LeadDetailsNotFound,
    get_for_client_line,
    patch_details,
    to_read,
)

router = APIRouter()


def _require_client(user: CurrentUser) -> None:
    if user.role != "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Client access required.")


async def _resolve(
    db: AsyncSession,
    user: CurrentUser,
    business_line: Literal["loans", "real_estate"],
    *,
    for_update: bool = False,
):
    _require_client(user)
    try:
        lead, profile_uuid = await get_for_client_line(
            db,
            auth_user_uuid=user.id,
            business_line=business_line,
            for_update=for_update,
        )
    except LeadDetailsNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Journey details not found.") from exc
    return lead, DetailActor(
        role="client",
        subject_uuid=profile_uuid,
        auth_user_uuid=user.id,
    )


@router.get("/{business_line}", response_model=LeadDetailsRead)
async def get_journey_details(
    business_line: Literal["loans", "real_estate"],
    response: Response,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> LeadDetailsRead:
    response.headers["Cache-Control"] = "private, no-store"
    lead, actor = await _resolve(db, current_user, business_line)
    return to_read(lead, actor)


@router.patch("/{business_line}", response_model=LeadDetailsRead)
async def update_journey_details(
    business_line: Literal["loans", "real_estate"],
    payload: LeadDetailsPatch,
    response: Response,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> LeadDetailsRead:
    response.headers["Cache-Control"] = "private, no-store"
    lead, actor = await _resolve(db, current_user, business_line, for_update=True)
    try:
        lead = await patch_details(db, lead=lead, payload=payload, actor=actor)
    except LeadDetailsForbidden as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "One or more details were supplied by another owner.",
        ) from exc
    except LeadDetailsLocked as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This journey is complete and its submitted details are locked.",
        ) from exc
    return to_read(lead, actor)
