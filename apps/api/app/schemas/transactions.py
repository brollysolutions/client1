"""Transaction schemas — client lists own payout ledger. Read-only.

No create schema: transactions are never created via this router — a future
money-layer producer inserts rows on a bypass session, the same mechanism as
services.notifications.emit_notification.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.transaction import TransactionStatus, TransactionType


class TransactionRead(BaseModel):
    id: UUID
    type: TransactionType
    status: TransactionStatus
    amount_paise: int
    currency: str
    description: str
    created_at: datetime


class TransactionListResponse(BaseModel):
    transactions: list[TransactionRead]
