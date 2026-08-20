"""Unit coverage for optional profile request validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.auth import MeUpdateRequest


def _request(**profile: object) -> MeUpdateRequest:
    return MeUpdateRequest(first_name="Aarav", last_name="Sharma", **profile)


def test_optional_profile_accepts_empty_values() -> None:
    request = _request(
        email=None,
        gender=None,
        gender_self_description=None,
        income_source=None,
        income_amount_minor=None,
        income_period=None,
        occupation=None,
        location=None,
    )
    assert request.email is None
    assert request.income_amount_minor is None


def test_optional_profile_normalizes_text_and_email() -> None:
    request = _request(
        email=" Person@Example.COM ",
        gender="self_described",
        gender_self_description="  Agender  ",
        income_source="salaried",
        income_amount_minor=500_000,
        income_period="monthly",
        occupation="  Engineer  ",
        location="  Hyderabad  ",
    )
    assert request.email == "person@example.com"
    assert request.gender_self_description == "Agender"
    assert request.occupation == "Engineer"
    assert request.location == "Hyderabad"


@pytest.mark.parametrize(
    "profile",
    [
        {"gender": "self_described"},
        {"gender": "female", "gender_self_description": "unexpected"},
        {"gender_self_description": None},
        {
            "income_source": "salaried",
            "income_amount_minor": 500_000,
        },
        {"income_source": None},
        {
            "income_source": "net_salary",
            "income_amount_minor": 500_000,
            "income_period": "monthly",
        },
        {"income_amount_minor": 0},
        {"occupation": "   "},
        {"location": "   "},
    ],
)
def test_optional_profile_rejects_inconsistent_or_unbounded_values(
    profile: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        _request(**profile)
