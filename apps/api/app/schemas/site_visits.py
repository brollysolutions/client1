"""Site visit schemas — client requests a listing viewing and lists/cancels their own.

Enums are imported from the model so the values are a single source of truth
and land in OpenAPI. The client never supplies user_uuid/business_line/status —
those are stamped server-side (router/service) only.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.site_visit import SiteVisitStatus, SiteVisitTimeSlot
from app.models.vehicle_arrangement import VehicleArrangementStatus


class VehicleArrangementClientRead(BaseModel):
    id: UUID
    pickup_location: str
    pickup_at: datetime
    status: VehicleArrangementStatus
    vehicle_make_model: str | None
    vehicle_registration: str | None
    driver_name: str | None
    driver_mobile: str | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime


class SiteVisitCreate(BaseModel):
    property_ref: Annotated[str, Field(min_length=1, max_length=80)]
    title: Annotated[str, Field(min_length=1, max_length=200)]
    locality: Annotated[str, Field(min_length=1, max_length=120)]
    city: Annotated[str, Field(min_length=1, max_length=120)]
    contact_name: Annotated[str, Field(min_length=1, max_length=100)]
    # Same E.164 pattern as PublicLeadCreate.mobile (schemas/leads.py).
    contact_mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    preferred_date: date
    preferred_time_slot: SiteVisitTimeSlot
    message: Annotated[str | None, Field(default=None, max_length=1000)] = None
    pickup_requested: bool = False
    pickup_location: Annotated[str | None, Field(default=None, max_length=500)] = None
    pickup_at: datetime | None = None

    @field_validator(
        "property_ref",
        "title",
        "locality",
        "city",
        "contact_name",
        "message",
        "pickup_location",
    )
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("property_ref", "title", "locality", "city", "contact_name")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("This field cannot be blank.")
        return v

    @field_validator("preferred_date")
    @classmethod
    def _not_in_past(cls, v: date) -> date:
        if v < date.today():
            raise ValueError("Preferred date cannot be in the past.")
        return v

    @model_validator(mode="after")
    def _validate_pickup_request(self) -> SiteVisitCreate:
        has_location = bool(self.pickup_location)
        has_time = self.pickup_at is not None
        if self.pickup_requested and not (has_location and has_time):
            raise ValueError("Pickup location and time are required when pickup is requested.")
        if not self.pickup_requested and (has_location or has_time):
            raise ValueError("Set pickup_requested before providing pickup details.")
        if self.pickup_at is not None:
            if self.pickup_at.tzinfo is None or self.pickup_at.utcoffset() is None:
                raise ValueError("Pickup time must include a timezone offset.")
            if self.pickup_at.astimezone(UTC) <= datetime.now(UTC):
                raise ValueError("Pickup time must be in the future.")
        return self


class SiteVisitRead(BaseModel):
    id: UUID
    property_ref: str
    title: str
    locality: str
    city: str
    contact_name: str
    contact_mobile: str
    preferred_date: date
    preferred_time_slot: SiteVisitTimeSlot
    message: str | None
    status: SiteVisitStatus
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    vehicle_arrangement: VehicleArrangementClientRead | None = None


class SiteVisitListResponse(BaseModel):
    visits: list[SiteVisitRead]
