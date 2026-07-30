"""Client-facing property-deal schemas (/api/v1/property-deals/*).

Deals are staff-initiated (see api/v1/telecaller.py for creation) — there is
no client-writable Create shape here, unlike loans' LoanApplicationCreate.
property is flattened from the relationship so callers never see the raw
property_id FK. PropertyDealProgressUpdate is the shared telecaller+admin PATCH
shape; shape-only validation lives in the schema, transition/reason/terms-gating
logic lives in the service (see services/property_deals.py) since it depends on
the deal's current status.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.property_deal import PropertyDealStatus


class DealPropertySummary(BaseModel):
    id: UUID
    title: str
    location: str


class PropertyDealRead(BaseModel):
    id: UUID
    property: DealPropertySummary
    status: PropertyDealStatus
    status_reason: str | None
    price_quoted: Decimal | None
    booking_amount: Decimal | None
    site_visit_uuid: UUID | None
    opened_at: datetime
    closed_at: datetime | None


class PropertyDealListResponse(BaseModel):
    deals: list[PropertyDealRead]


class AgentContactRead(BaseModel):
    """Name + agent_code only -- never phone/email. Contact routes through
    the support-ticket flow (POST /api/v1/support-tickets/tickets)."""

    name: str
    agent_code: str


class PropertyDealProgressUpdate(BaseModel):
    status: PropertyDealStatus | None = None
    status_reason: Annotated[str | None, Field(default=None, max_length=1000)] = None
    price_quoted: Annotated[
        Decimal | None, Field(default=None, gt=0, le=Decimal("999999999999.99"))
    ] = None
    booking_amount: Annotated[
        Decimal | None, Field(default=None, gt=0, le=Decimal("999999999999.99"))
    ] = None
    site_visit_uuid: UUID | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> PropertyDealProgressUpdate:
        if (
            self.status is None
            and self.status_reason is None
            and self.price_quoted is None
            and self.booking_amount is None
            and self.site_visit_uuid is None
        ):
            raise ValueError("Provide at least one field to update.")
        return self
