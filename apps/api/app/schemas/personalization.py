"""Closed contracts for authenticated marketing personalization.

Audience rules remain JSONB on the CMS tables, but they are never arbitrary
JSON: every authoring and serving path parses this module's versioned grammar.
Unknown keys and invalid role/signal combinations fail closed.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.banner import BannerType

UserType = Literal["client", "agent", "employee", "telecaller"]
ClientJourneyStage = Literal[
    "not_started",
    "in_progress",
    "on_hold",
    "completed",
    "rejected",
    "closed",
]
AgentSignal = Literal[
    "no_leads",
    "has_active_leads",
    "has_converted_leads",
    "has_pending_commission",
    "has_paid_commission",
]


class AudienceLocationCircle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_km: float = Field(ge=5, le=500)


class AudienceRules(BaseModel):
    """Version-one rule grammar.

    Populated dimensions are ANDed. Values within one dimension are ORed.
    An empty object is the canonical generic-content representation.
    """

    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    user_types: list[UserType] = Field(default_factory=list, max_length=4)
    client_journey_stages: list[ClientJourneyStage] = Field(default_factory=list, max_length=6)
    agent_signals: list[AgentSignal] = Field(default_factory=list, max_length=5)
    locations: list[AudienceLocationCircle] = Field(default_factory=list, max_length=10)

    @model_validator(mode="before")
    @classmethod
    def populated_rules_require_explicit_version(cls, data: object) -> object:
        # `{}` is the canonical generic/public representation. Every targeted
        # rule must identify its grammar version explicitly so a legacy object
        # is never silently reinterpreted under version one.
        if isinstance(data, dict) and data and "version" not in data:
            raise ValueError("Targeted audience rules require an explicit version.")
        return data

    @field_validator("user_types", "client_journey_stages", "agent_signals")
    @classmethod
    def values_are_unique(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("Audience rule values must be unique.")
        return values

    @model_validator(mode="after")
    def role_dimensions_are_consistent(self) -> AudienceRules:
        if self.client_journey_stages and self.user_types != ["client"]:
            raise ValueError("Client journey stages require a Client-only audience.")
        if self.agent_signals and self.user_types != ["agent"]:
            raise ValueError("Agent signals require an Agent-only audience.")
        if self.client_journey_stages and self.agent_signals:
            raise ValueError("Client journey and Agent activity cannot be combined.")
        if (
            self.client_journey_stages or self.agent_signals or self.locations
        ) and not self.user_types:
            raise ValueError("Audience signals require at least one user type.")
        return self

    @property
    def is_empty(self) -> bool:
        return not (
            self.user_types or self.client_journey_stages or self.agent_signals or self.locations
        )


def audience_rules_to_storage(rules: AudienceRules) -> dict:
    """Keep generic rows as exactly `{}` so the public allowlist is simple."""
    if rules.is_empty:
        return {}
    data = rules.model_dump(mode="json", exclude_defaults=True)
    data["version"] = 1
    return data


def audience_rules_valid_for_banner(banner_type: BannerType, rules: AudienceRules) -> bool:
    if banner_type == BannerType.PERSONALIZED:
        return bool(rules.user_types)
    return rules.is_empty


def audience_rules_valid_for_offer(rules: AudienceRules) -> bool:
    """Every coupon campaign names at least one authenticated dashboard role."""
    return bool(rules.user_types)


class PersonalizationPreferenceRead(BaseModel):
    personalization_enabled: bool
    location_enabled: bool
    location_captured_at: datetime | None


class PersonalizationPreferenceUpdate(BaseModel):
    personalization_enabled: bool


class LocationCaptureRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AuthenticatedBannerRead(BaseModel):
    id: UUID
    banner_type: BannerType
    title: str
    subtitle: str | None
    cta_label: str | None
    deep_link: str | None
    image_url: str | None


class AuthenticatedOfferRead(BaseModel):
    id: UUID
    title: str
    description: str | None
    discount_type: str
    discount_value: Decimal
    code: str | None
    partner_name: str
    redemption_url: str
    terms_summary: str
    terms_url: str | None
    image_url: str


class AuthenticatedPlacementResponse(BaseModel):
    banners: list[AuthenticatedBannerRead]
    offers: list[AuthenticatedOfferRead]
