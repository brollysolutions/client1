"""Minimized, read-only operational records for platform Admin.

The router-level dependency is the application authorization wall. PostgreSQL
RLS independently requires the same role/scope pair for cross-user reads. The
dedicated response models omit raw authentication metadata, contact/message
fields, exact pickup locations, and reusable financial references.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_platform_admin
from app.db.session import get_db
from app.schemas.admin_operations import (
    AdminAuthEventListResponse,
    AdminAuthEventRead,
    AdminEnquiryListResponse,
    AdminEnquiryRead,
    AdminFieldVisibilityConfigListResponse,
    AdminFieldVisibilityConfigRead,
    AdminLeadActivityListResponse,
    AdminLeadActivityRead,
    AdminLoanTransactionHistoryListResponse,
    AdminLoanTransactionHistoryRead,
    AdminSiteVisitListResponse,
    AdminSiteVisitRead,
    AdminTransactionListResponse,
    AdminTransactionRead,
)
from app.services import admin_operations


def _set_private_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


router = APIRouter(dependencies=[Depends(require_platform_admin), Depends(_set_private_no_store)])


@router.get("/auth-events", response_model=AdminAuthEventListResponse)
async def list_auth_events(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> AdminAuthEventListResponse:
    rows, total = await admin_operations.list_auth_events(db, limit=limit, offset=offset)
    return AdminAuthEventListResponse(
        events=[
            AdminAuthEventRead(
                id=row.id,
                auth_user_uuid=row.auth_user_uuid,
                event_type=row.event_type,
                success=row.success,
                created_at=row.created_at,
            )
            for row in rows
        ],
        total=total,
    )


@router.get("/enquiries", response_model=AdminEnquiryListResponse)
async def list_enquiries(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> AdminEnquiryListResponse:
    rows, total = await admin_operations.list_enquiries(db, limit=limit, offset=offset)
    return AdminEnquiryListResponse(
        enquiries=[AdminEnquiryRead.model_validate(row, from_attributes=True) for row in rows],
        total=total,
    )


@router.get(
    "/field-visibility-config",
    response_model=AdminFieldVisibilityConfigListResponse,
)
async def list_field_visibility_configs(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> AdminFieldVisibilityConfigListResponse:
    rows, total = await admin_operations.list_field_visibility_configs(
        db, limit=limit, offset=offset
    )
    return AdminFieldVisibilityConfigListResponse(
        configs=[
            AdminFieldVisibilityConfigRead.model_validate(row, from_attributes=True) for row in rows
        ],
        total=total,
    )


@router.get("/lead-activities", response_model=AdminLeadActivityListResponse)
async def list_lead_activities(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> AdminLeadActivityListResponse:
    rows, total = await admin_operations.list_lead_activities(db, limit=limit, offset=offset)
    return AdminLeadActivityListResponse(
        activities=[
            AdminLeadActivityRead.model_validate(row, from_attributes=True) for row in rows
        ],
        total=total,
    )


@router.get(
    "/loan-transaction-history",
    response_model=AdminLoanTransactionHistoryListResponse,
)
async def list_loan_transaction_history(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> AdminLoanTransactionHistoryListResponse:
    rows, total = await admin_operations.list_loan_transaction_history(
        db, limit=limit, offset=offset
    )
    return AdminLoanTransactionHistoryListResponse(
        entries=[
            AdminLoanTransactionHistoryRead.model_validate(row, from_attributes=True)
            for row in rows
        ],
        total=total,
    )


@router.get("/site-visits", response_model=AdminSiteVisitListResponse)
async def list_site_visits(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> AdminSiteVisitListResponse:
    rows, total = await admin_operations.list_site_visits(db, limit=limit, offset=offset)
    return AdminSiteVisitListResponse(
        visits=[AdminSiteVisitRead.model_validate(row, from_attributes=True) for row in rows],
        total=total,
    )


@router.get("/transactions", response_model=AdminTransactionListResponse)
async def list_transactions(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> AdminTransactionListResponse:
    rows, total = await admin_operations.list_transactions(db, limit=limit, offset=offset)
    return AdminTransactionListResponse(
        transactions=[
            AdminTransactionRead.model_validate(row, from_attributes=True) for row in rows
        ],
        total=total,
    )
