"""Pure validation and state-machine checks for vehicle arrangements."""

from datetime import UTC, date, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.models.vehicle_arrangement import VehicleArrangement, VehicleArrangementStatus
from app.schemas.site_visits import SiteVisitCreate
from app.services.vehicle_arrangements import (
    ArrangementDetailsRequired,
    InvalidArrangementEmployee,
    InvalidArrangementTransition,
    _apply_transition,
)


def _visit_payload(**overrides: object) -> dict:
    payload = {
        "property_ref": "prop-1",
        "title": "Lake View Apartment",
        "locality": "Whitefield",
        "city": "Bengaluru",
        "contact_name": "Asha Rao",
        "contact_mobile": "+919876543210",
        "preferred_date": date.today() + timedelta(days=1),
        "preferred_time_slot": "morning",
    }
    payload.update(overrides)
    return payload


def test_pickup_requires_location_and_aware_future_time() -> None:
    with pytest.raises(ValidationError):
        SiteVisitCreate.model_validate(_visit_payload(pickup_requested=True))
    with pytest.raises(ValidationError):
        SiteVisitCreate.model_validate(
            _visit_payload(
                pickup_requested=True,
                pickup_location="MG Road",
                pickup_at=datetime.now() + timedelta(hours=2),
            )
        )

    parsed = SiteVisitCreate.model_validate(
        _visit_payload(
            pickup_requested=True,
            pickup_location="  MG Road  ",
            pickup_at=datetime.now(UTC) + timedelta(hours=2),
        )
    )
    assert parsed.pickup_location == "MG Road"


def test_pickup_fields_rejected_without_opt_in() -> None:
    with pytest.raises(ValidationError):
        SiteVisitCreate.model_validate(
            _visit_payload(
                pickup_location="MG Road",
                pickup_at=datetime.now(UTC) + timedelta(hours=2),
            )
        )


def test_state_machine_requires_details_then_employee() -> None:
    arrangement = VehicleArrangement(
        business_line="real_estate",
        pickup_location="MG Road",
        pickup_at=datetime.now(UTC) + timedelta(hours=2),
        status=VehicleArrangementStatus.REQUESTED,
    )
    with pytest.raises(ArrangementDetailsRequired):
        _apply_transition(arrangement, VehicleArrangementStatus.ARRANGED)

    arrangement.status = VehicleArrangementStatus.REQUESTED
    arrangement.vehicle_make_model = "Toyota Innova"
    arrangement.vehicle_registration = "KA01AB1234"
    arrangement.driver_name = "Ravi"
    arrangement.driver_mobile = "+919876543210"
    _apply_transition(arrangement, VehicleArrangementStatus.ARRANGED)

    with pytest.raises(InvalidArrangementEmployee):
        _apply_transition(arrangement, VehicleArrangementStatus.ASSIGNED)


def test_state_machine_rejects_skipping_arranged() -> None:
    arrangement = VehicleArrangement(
        business_line="real_estate",
        pickup_location="MG Road",
        pickup_at=datetime.now(UTC) + timedelta(hours=2),
        status=VehicleArrangementStatus.REQUESTED,
    )
    with pytest.raises(InvalidArrangementTransition):
        _apply_transition(arrangement, VehicleArrangementStatus.ASSIGNED)
