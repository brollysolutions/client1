"""Client-facing loan applications + loan-type reference data.

GET endpoints: RLS (migration 2b3c4d5e6f7a) is the real access boundary — a
client's own rows, a line staff member's own line, or Admin/Sub Admin
(platform_scope) — this layer just authenticates and shapes the response.

POST /applications (migration 8b9c1d2e3f4a) is client self-service only: it
resolves/creates the client's loans lead (the lead spine every application
must hang off of, see services.leads.resolve_loans_lead), then inserts the
application stamped with the caller's own client_profile_uuid. The DB's
partial-unique index allows only one non-terminal application per client
profile; a second attempt surfaces as 409, not a raw integrity error.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.loan import Bank, BankLoanTypeAvailability, LoanApplication, LoanType
from app.schemas.loans import (
    BankListResponse,
    BankRead,
    LoanApplicationCreate,
    LoanApplicationListResponse,
    LoanApplicationRead,
    LoanTypeListResponse,
    LoanTypeRead,
)
from app.services.leads import resolve_loans_lead

router = APIRouter()


def _require_loans_client(current_user: CurrentUser) -> None:
    # Applying for a loan is client self-service only, and only for a client
    # who actually holds a loans profile. Every self-registered client is
    # unconditionally both-line today (register_set_password hardcodes
    # lines=["loans","real_estate"], backstopped by the
    # backfill_customer_codes job), so this branch isn't reachable via that
    # path — but nothing in the DB or type system guarantees a client can
    # never be single-line (CLAUDE.md's own invariant allows it), and
    # auth_service._build_access_claims picks client_profile_uuid as
    # clients[0] after an alphabetical sort, which is the LOANS profile only
    # when the client actually has one. Guard it explicitly rather than
    # rely on that assumption never changing: stamping a real-estate
    # profile's id onto a loans-only loan_applications row would silently
    # cross the line-segregation boundary.
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can apply for a loan.",
        )
    if current_user.business_line not in ("loans", "both"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account does not have a loans profile.",
        )


@router.get("/loan-types", response_model=LoanTypeListResponse)
async def list_loan_types(
    current_user: CurrentUser = Depends(get_active_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> LoanTypeListResponse:
    result = await db.execute(
        select(LoanType).where(LoanType.active.is_(True)).order_by(LoanType.label)
    )
    loan_types = result.scalars().all()
    return LoanTypeListResponse(
        loan_types=[LoanTypeRead.model_validate(lt, from_attributes=True) for lt in loan_types]
    )


@router.get("/banks", response_model=BankListResponse)
async def list_banks(
    loan_type_id: UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(get_active_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> BankListResponse:
    if loan_type_id is not None:
        loan_type = await db.get(LoanType, loan_type_id)
        if loan_type is None:
            # A typo'd param silently falling back to the unfiltered list would
            # be indistinguishable from "every bank offers this type" — the
            # exact dead-config failure this endpoint exists to prevent.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown loan type.")

    stmt = select(Bank).where(Bank.active.is_(True))
    if loan_type_id is not None:
        stmt = stmt.where(
            ~select(BankLoanTypeAvailability.bank_id)
            .where(
                BankLoanTypeAvailability.bank_id == Bank.id,
                BankLoanTypeAvailability.loan_type_id == loan_type_id,
                BankLoanTypeAvailability.available.is_(False),
            )
            .exists()
        )
    result = await db.execute(stmt.order_by(Bank.name))
    banks = result.scalars().all()
    return BankListResponse(banks=[BankRead.model_validate(b, from_attributes=True) for b in banks])


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


@router.post(
    "/applications", response_model=LoanApplicationRead, status_code=status.HTTP_201_CREATED
)
async def create_loan_application(
    req: LoanApplicationCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> LoanApplicationRead:
    _require_loans_client(current_user)
    # _require_loans_client already confirmed business_line in ("loans", "both"),
    # which _build_access_claims only ever sets alongside client_profile_uuid.
    assert current_user.client_profile_uuid is not None

    loan_type = await db.get(LoanType, req.loan_type_id)
    if loan_type is None or not loan_type.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown loan type.")

    lead_id = await resolve_loans_lead(current_user.mobile, current_user.client_profile_uuid)

    application = LoanApplication(
        lead_uuid=lead_id,
        client_profile_uuid=current_user.client_profile_uuid,
        business_line="loans",
        loan_type_id=req.loan_type_id,
        amount_requested=req.amount_requested,
    )
    db.add(application)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an active loan application in progress.",
        ) from None

    # Capture the id before expiring: application.id itself becomes a stale
    # attribute below, and accessing it post-expire would trigger an
    # implicit (unawaited) lazy-load.
    application_id = application.id
    # Force a fresh read: `application` is already in the session's identity
    # map with the client-supplied (un-normalized) Decimal still set, which a
    # plain re-query would NOT overwrite for an already-loaded scalar column
    # (unlike a relationship, which an eager loader does populate). expire()
    # marks it stale so the select below re-reads the DB's NUMERIC(14,2)
    # -normalized value, matching how GET returns it elsewhere.
    db.expire(application)
    result = await db.execute(
        select(LoanApplication)
        .options(joinedload(LoanApplication.loan_type))
        .where(LoanApplication.id == application_id)
    )
    created = result.scalar_one()
    return LoanApplicationRead.model_validate(created, from_attributes=True)
