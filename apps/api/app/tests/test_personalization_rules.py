"""Pure contract and matching tests for authenticated placement targeting."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.banner import BannerType
from app.schemas.personalization import (
    AudienceRules,
    audience_rules_valid_for_banner,
    audience_rules_valid_for_offer,
)
from app.services.personalization import AudienceContext, _coordinate_e2, matches_audience


def test_empty_rules_are_only_valid_for_generic_banner_layers() -> None:
    rules = AudienceRules.model_validate({})

    assert audience_rules_valid_for_banner(BannerType.DEFAULT, rules)
    assert audience_rules_valid_for_banner(BannerType.ACTION, rules)
    assert not audience_rules_valid_for_banner(BannerType.PERSONALIZED, rules)


def test_personalized_banner_requires_user_type() -> None:
    rules = AudienceRules(version=1, user_types=["client"])

    assert audience_rules_valid_for_banner(BannerType.PERSONALIZED, rules)
    assert not audience_rules_valid_for_banner(BannerType.DEFAULT, rules)


@pytest.mark.parametrize(
    "payload",
    [
        {"version": 1, "user_types": ["client"], "unknown": True},
        {"user_types": ["client"]},
        {
            "version": 1,
            "user_types": ["agent"],
            "client_journey_stages": ["in_progress"],
        },
        {"version": 1, "user_types": ["client"], "agent_signals": ["no_leads"]},
        {
            "version": 1,
            "user_types": ["client", "agent"],
            "client_journey_stages": ["in_progress"],
        },
        {
            "version": 1,
            "user_types": ["client", "agent"],
            "agent_signals": ["has_active_leads"],
        },
        {
            "version": 1,
            "user_types": ["client", "agent"],
            "client_journey_stages": ["in_progress"],
            "agent_signals": ["has_active_leads"],
        },
    ],
)
def test_invalid_or_impossible_rule_grammars_fail_closed(payload: dict) -> None:
    with pytest.raises(ValidationError):
        AudienceRules.model_validate(payload)


def test_populated_dimensions_are_anded_and_values_are_ored() -> None:
    rules = AudienceRules.model_validate(
        {
            "version": 1,
            "user_types": ["client"],
            "client_journey_stages": ["in_progress", "on_hold"],
            "locations": [
                {"label": "Hyderabad", "latitude": 17.38, "longitude": 78.49, "radius_km": 25}
            ],
        }
    )
    matching = AudienceContext(
        role="client",
        business_line="loans",
        personalization_enabled=True,
        client_journey_stages=frozenset({"on_hold"}),
        location=(17.4, 78.5),
    )
    wrong_stage = AudienceContext(
        role="client",
        business_line="loans",
        personalization_enabled=True,
        client_journey_stages=frozenset({"completed"}),
        location=(17.4, 78.5),
    )

    assert matches_audience(rules, matching)
    assert not matches_audience(rules, wrong_stage)
    assert not matches_audience(
        rules, AudienceContext(**{**matching.__dict__, "personalization_enabled": False})
    )


def test_location_is_rounded_to_hundredths_before_persistence() -> None:
    assert _coordinate_e2(17.3851) == 1739
    assert _coordinate_e2(-78.4951) == -7850


def test_offers_accept_generic_or_client_only_rules() -> None:
    assert audience_rules_valid_for_offer(AudienceRules.model_validate({}))
    assert audience_rules_valid_for_offer(
        AudienceRules.model_validate({"version": 1, "user_types": ["client"]})
    )
    assert not audience_rules_valid_for_offer(
        AudienceRules.model_validate({"version": 1, "user_types": ["client", "agent"]})
    )
