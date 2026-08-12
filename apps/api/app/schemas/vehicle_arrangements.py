"""Admin and Employee contracts for real-estate vehicle arrangements."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.vehicle_arrangement import VehicleArrangementStatus


class VehicleArrangementStaffRead(BaseModel):
    id: UUID
    site_visit_uuid: UUID
    property_title: str
    property_locality: str
    property_city: str
    pickup_location: str
    pickup_at: datetime
    status: VehicleArrangementStatus
    vehicle_make_model: str | None
    vehicle_registration: str | None
    driver_name: str | None
    driver_mobile: str | None
    assigned_employee_profile_uuid: UUID | None
    assigned_employee_name: str | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime


class VehicleArrangementAdminListResponse(BaseModel):
    arrangements: list[VehicleArrangementStaffRead]


class VehicleArrangementAdminUpdate(BaseModel):
    status: VehicleArrangementStatus | None = None
    vehicle_make_model: Annotated[str | None, Field(default=None, min_length=1, max_length=160)]
    vehicle_registration: Annotated[str | None, Field(default=None, min_length=1, max_length=40)]
    driver_name: Annotated[str | None, Field(default=None, min_length=1, max_length=120)]
    driver_mobile: Annotated[str | None, Field(default=None, pattern=r"^\+[1-9]\d{6,14}$")]
    cancellation_reason: Annotated[str | None, Field(default=None, max_length=500)] = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> VehicleArrangementAdminUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        for field_name in (
            "vehicle_make_model",
            "vehicle_registration",
            "driver_name",
            "cancellation_reason",
        ):
            value = getattr(self, field_name)
            if isinstance(value, str):
                setattr(self, field_name, value.strip())
        return self


class VehicleArrangementEmployeeUpdate(BaseModel):
    status: Literal["completed", "cancelled"]
    cancellation_reason: Annotated[str | None, Field(default=None, max_length=500)] = None

    @model_validator(mode="after")
    def _validate_reason(self) -> VehicleArrangementEmployeeUpdate:
        if isinstance(self.cancellation_reason, str):
            self.cancellation_reason = self.cancellation_reason.strip() or None
        if self.status == "completed" and self.cancellation_reason is not None:
            raise ValueError("A cancellation reason is only valid when cancelling.")
        return self
