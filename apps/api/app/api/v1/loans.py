"""Client-facing loan applications (read-only).

GET /applications and GET /applications/{id}. RLS (migration 2b3c4d5e6f7a)
is the real access boundary — a client's own rows, a line staff member's own
line, or Admin/Sub Admin (platform_scope) — this layer just authenticates and
shapes the response. No create/update endpoint exists yet: there is no
staff/telecaller workflow to open or advance a loan_applications row, so the
table stays empty until that follow-up ships.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.loan import LoanApplication
from app.schemas.loans import LoanApplicationListResponse, LoanApplicationRead

router = APIRouter()


@router.get("/applications", response_model=LoanApplicationListResponse)
async def list_loan_applications(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> LoanApplicationListResponse:
    result = await db.execute(
        select(LoanApplication)
        .options(joinedload(LoanApplication.loan_type))
        .order_by(LoanApplication.opened_at.desc())
    )
    applications = result.scalars().all()
    return LoanApplicationListResponse(
        applications=[
            LoanApplicationRead.model_validate(a, from_attributes=True) for a in applications
        ]
    )


@router.get("/applications/{application_id}", response_model=LoanApplicationRead)
async def get_loan_application(
    application_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> LoanApplicationRead:
    result = await db.execute(
        select(LoanApplication)
        .options(joinedload(LoanApplication.loan_type))
        .where(LoanApplication.id == application_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        # RLS already filters rows outside the caller's access; a miss here is
        # indistinguishable from "does not exist" and must read that way too.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Loan application not found."
        )
    return LoanApplicationRead.model_validate(application, from_attributes=True)
