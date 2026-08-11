"""Read-only platform-Admin operational record queries.

Every query uses the request-scoped async session after ``get_db`` installs the
caller's RLS context. This module never creates a bypass session. Response
minimization remains explicit in the router schemas; callers never serialize
whole ORM rows.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base
from app.models.auth import AuthEvent
from app.models.enquiry import Enquiry
from app.models.lead_activity import LeadActivity
from app.models.loan import LoanTxnHistory
from app.models.site_visit import SiteVisit
from app.models.transaction import Transaction


async def _list_page[ModelT: Base](
    db: AsyncSession,
    model: type[ModelT],
    *,
    limit: int,
    offset: int,
) -> tuple[list[ModelT], int]:
    total = await db.scalar(select(func.count()).select_from(model)) or 0
    rows = (
        await db.scalars(
            select(model)
            .order_by(model.created_at.desc(), model.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return list(rows), total


async def list_auth_events(
    db: AsyncSession, *, limit: int, offset: int
) -> tuple[list[AuthEvent], int]:
    return await _list_page(db, AuthEvent, limit=limit, offset=offset)


async def list_enquiries(db: AsyncSession, *, limit: int, offset: int) -> tuple[list[Enquiry], int]:
    return await _list_page(db, Enquiry, limit=limit, offset=offset)


async def list_lead_activities(
    db: AsyncSession, *, limit: int, offset: int
) -> tuple[list[LeadActivity], int]:
    return await _list_page(db, LeadActivity, limit=limit, offset=offset)


async def list_loan_transaction_history(
    db: AsyncSession, *, limit: int, offset: int
) -> tuple[list[LoanTxnHistory], int]:
    return await _list_page(db, LoanTxnHistory, limit=limit, offset=offset)


async def list_site_visits(
    db: AsyncSession, *, limit: int, offset: int
) -> tuple[list[SiteVisit], int]:
    return await _list_page(db, SiteVisit, limit=limit, offset=offset)


async def list_transactions(
    db: AsyncSession, *, limit: int, offset: int
) -> tuple[list[Transaction], int]:
    return await _list_page(db, Transaction, limit=limit, offset=offset)
