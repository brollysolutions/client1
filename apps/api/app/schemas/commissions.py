"""Commission schemas — Admin entry against an eligible-deal queue (PR 1),
Admin oversight, and the agent's own read-only earnings ledger.

`CommissionCreate` deliberately carries no agent, line, or lead — those are
derived server-side from the deal row (`services/commissions.py::create_commission`),
never accepted from the request, the same discipline `ReferralPayoutRequest`
uses for amount/recipient.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

DealType = Literal["loan_application", "property_deal"]


class EligibleDeal(BaseModel):
    """One row in the Admin entry queue: a disbursed loan or a closed_won
    property deal with an origin agent and no live commission yet."""

    deal_type: DealType
    deal_uuid: UUID
    business_line: str
    agent_profile_uuid: UUID
    agent_code: str
    agent_name: str | None
    lead_uuid: UUID
    # The date this deal became commission-eligible: disbursed_at for a loan
    # (DISBURSED is not terminal — a loan can move on to CLOSED afterward,
    # so this is an event marker, not live status), closed_at for a property
    # deal (CLOSED genuinely is terminal there).
    eligible_since: datetime | None


class EligibleDealListResponse(BaseModel):
    deals: list[EligibleDeal]
    total: int


class CommissionCreate(BaseModel):
    deal_type: DealType
    deal_uuid: UUID
    agreed_amount_paise: int = Field(gt=0, le=10_000_000_000)
    notes: str | None = Field(default=None, max_length=1000)


class CommissionRead(BaseModel):
    id: UUID
    agent_profile_uuid: UUID
    agent_code: str
    agent_name: str | None
    business_line: str
    deal_type: DealType
    deal_uuid: UUID
    agreed_amount_paise: int
    status: str
    payout_uuid: UUID | None
    notes: str | None
    cancelled_reason: str | None
    created_at: datetime
    updated_at: datetime


class CommissionListResponse(BaseModel):
    commissions: list[CommissionRead]
    total: int


class CommissionCancelRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class AgentEarningsRow(BaseModel):
    id: UUID
    business_line: str
    deal_type: DealType
    deal_uuid: UUID
    agreed_amount_paise: int
    status: str
    payout_txn_uuid: UUID | None
    created_at: datetime


class AgentEarningsTotals(BaseModel):
    pending_amount_paise: int
    paid_amount_paise: int
    total_amount_paise: int


class AgentEarningsResponse(BaseModel):
    rows: list[AgentEarningsRow]
    totals: AgentEarningsTotals
