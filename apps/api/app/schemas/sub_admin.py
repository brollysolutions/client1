"""Sub Admin home schemas — aggregated landing summary (slice 5).

One GET aggregates what would otherwise be four-to-five waterfall requests
against banners/offers/content-blocks/property-submissions/transactions,
following the AgentHomeResponse/EmployeeHome convention (a single backend
summary endpoint rather than client-side parallel fetch).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.referral_bonus import ReferralPayoutActivityRead


class PendingApprovalItem(BaseModel):
    """An own-authored banner or property listing still awaiting Admin review."""

    id: UUID
    kind: str  # "banner" | "property_submission"
    title: str
    business_line: str
    submitted_at: datetime


class SubAdminHomeResponse(BaseModel):
    pending_approval: list[PendingApprovalItem]
    live_banners_count: int
    live_offers_count: int
    content_drafts_count: int
    recent_referral_payouts: list[ReferralPayoutActivityRead]
