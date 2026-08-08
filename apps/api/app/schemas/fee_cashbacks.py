"""Fee-cashback schemas — Admin entry against an eligible-application queue,
Admin oversight, and payout execution (FR-6.6).

`FeeCashbackCreate` deliberately carries no client, recipient, or line — those
are derived server-side from the loan-application row
(services/fee_cashbacks.py::create_fee_cashback), never accepted from the
request, the same discipline `CommissionCreate` uses.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.payout import PayoutDestination
from app.schemas.payments import PayoutDestinationInput, validate_destination


class EligibleFeeApplication(BaseModel):
    """One row in the Admin entry queue: a disbursed loan application with
    fee_outcome='cashback', a positive processing_fee, and no live cashback
    row yet."""

    loan_application_uuid: UUID
    business_line: str
    client_profile_uuid: UUID
    client_name: str | None
    processing_fee_paise: int
    # disbursed_at — an event marker, not live status (DISBURSED is not a
    # terminal loan status). See models/loan.py's disbursed_at docstring.
    eligible_since: datetime | None


class EligibleFeeApplicationListResponse(BaseModel):
    applications: list[EligibleFeeApplication]
    total: int


class FeeCashbackCreate(BaseModel):
    loan_application_uuid: UUID
    amount_paise: int = Field(gt=0, le=10_000_000_000)
    notes: str | None = Field(default=None, max_length=1000)


class FeeCashbackRead(BaseModel):
    id: UUID
    loan_application_uuid: UUID
    client_profile_uuid: UUID
    client_name: str | None
    business_line: str
    processing_fee_paise: int
    amount_paise: int
    status: str
    payout_uuid: UUID | None
    notes: str | None
    cancelled_reason: str | None
    created_at: datetime
    updated_at: datetime


class FeeCashbackListResponse(BaseModel):
    cashbacks: list[FeeCashbackRead]
    total: int


class FeeCashbackCancelRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class FeeCashbackPayoutRequest(BaseModel):
    """No amount, no recipient: both come from the cashback row
    (services/fee_cashbacks.py::attach_payout), never the request body — same
    invariant as CommissionPayoutRequest. The idempotency key is derived
    server-side from the cashback id (`fcb-{uuid.hex}`), not accepted from the
    client, for the identical reason CommissionPayoutRequest's docstring
    records."""

    destination_type: PayoutDestination
    destination: PayoutDestinationInput

    @model_validator(mode="after")
    def _require_matching_destination(self) -> FeeCashbackPayoutRequest:
        validate_destination(self.destination_type, self.destination)
        return self


class FeeCashbackPayoutResponse(BaseModel):
    payout_id: UUID
