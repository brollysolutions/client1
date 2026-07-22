"""Client transaction ledger — list own. Read-only.

Identity-level (migration 7a8b9c1d2e3f): RLS scopes rows to the owner
(app.auth_user_uuid) or platform_scope. There is no create endpoint — rows
are inserted later by the money-layer producer on a bypass session. No role
guard: RLS already scopes each caller to their own rows, and agents
legitimately own commission-type rows here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.transaction import Transaction
from app.schemas.transactions import TransactionListResponse, TransactionRead

router = APIRouter()


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> TransactionListResponse:
    result = await db.execute(select(Transaction).order_by(Transaction.created_at.desc()))
    transactions = result.scalars().all()
    return TransactionListResponse(
        transactions=[TransactionRead.model_validate(t, from_attributes=True) for t in transactions]
    )
