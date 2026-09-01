"""Closed, version-one property subtype payloads and public-text validation.

Common catalogue facets remain columns on ``properties`` and
``property_submissions``.  Facts that exist only for one property family live
in ``structured_details`` and are accepted only through this discriminated
union.  The legacy free-form ``details`` column remains private compatibility
storage and is not an input to new submissions.
"""

from __future__ import annotations

import enum
import re
import unicodedata
from datetime import date
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

_LINK_RE = re.compile(
    r"(?i)(?:[a-z][a-z0-9+.-]*://|www\.|"
    r"\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,63}\b)"
)
_EMAIL_RE = re.compile(r"(?i)\b[^\s@]+@[^\s@]+\.[^\s@]+\b")
_HTML_OR_MARKDOWN_LINK_RE = re.compile(r"<[^>]+>|\[[^\]]+\]\([^)]+\)")


def _normalize_public_text(
    value: str,
    *,
    max_words: int,
    field_name: str,
    min_words: int = 0,
) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if any(character.isdigit() for character in value):
        raise ValueError(f"{field_name} cannot contain numbers.")
    if _LINK_RE.search(value) or _EMAIL_RE.search(value) or _HTML_OR_MARKDOWN_LINK_RE.search(value):
        raise ValueError(f"{field_name} cannot contain links or contact details.")
    if any(
        unicodedata.category(character).startswith("C") and character not in {"\n", "\t"}
        for character in value
    ):
        raise ValueError(f"{field_name} contains unsupported control characters.")
    word_count = len(value.split())
    if word_count < min_words:
        raise ValueError(f"{field_name} must be at least {min_words} words.")
    if word_count > max_words:
        raise ValueError(f"{field_name} must be {max_words} words or fewer.")
    return value


def _about_project(value: str) -> str:
    return _normalize_public_text(value, max_words=500, field_name="About the project")


def _about_property(value: str) -> str:
    return _normalize_public_text(value, max_words=250, field_name="About the property")


def _amenities_description(value: str) -> str:
    return _normalize_public_text(value, max_words=150, field_name="Amenities description")


def _project_amenities_description(value: str) -> str:
    return _normalize_public_text(
        value,
        min_words=150,
        max_words=500,
        field_name="Amenities description",
    )


def _other_information(value: str) -> str:
    return _normalize_public_text(value, max_words=250, field_name="Additional information")


ProjectAbout = Annotated[
    str,
    Field(min_length=1, max_length=5000),
    AfterValidator(_about_project),
]
PropertyAbout = Annotated[
    str,
    Field(min_length=1, max_length=3000),
    AfterValidator(_about_property),
]
AmenitiesDescription = Annotated[
    str,
    Field(min_length=1, max_length=2000),
    AfterValidator(_amenities_description),
]
ProjectAmenitiesDescription = Annotated[
    str,
    Field(min_length=1, max_length=5000),
    AfterValidator(_project_amenities_description),
]
OtherInformation = Annotated[
    str,
    Field(min_length=1, max_length=3000),
    AfterValidator(_other_information),
]
FacilityLabel = Annotated[str, Field(min_length=1, max_length=80)]


class Facing(enum.StrEnum):
    EAST = "east"
    WEST = "west"
    NORTH = "north"
    SOUTH = "south"
    NOT_APPLICABLE = "not_applicable"


class SaleType(enum.StrEnum):
    """New-vs-resale, meaningful only for a sale listing.

    Optional on the detail models because a rent/lease listing has no sale type.
    It is not freely optional though: ``SubmissionFacts`` requires it when
    ``listing_intent`` is ``sale`` and rejects it when the intent is ``rent``,
    so a sale listing can still never omit it.
    """

    NEW_SALE = "new_sale"
    RESALE = "resale"


class YesNoUnknown(enum.StrEnum):
    YES = "yes"
    NO = "no"
    UNKNOWN = "unknown"


class ResidentialConfiguration(enum.StrEnum):
    ONE_BHK = "1_bhk"
    TWO_BHK = "2_bhk"
    THREE_BHK = "3_bhk"
    FOUR_BHK = "4_bhk"
    FIVE_PLUS_BHK = "5_plus_bhk"
    STUDIO = "studio"


class PropertyUse(enum.StrEnum):
    RESIDENTIAL = "residential"
    MIXED_USE = "residential_commercial"


class CommercialOwnership(enum.StrEnum):
    INDIVIDUAL = "individual"
    ENTITY = "entity"


class RentalIncomeStart(enum.StrEnum):
    IMMEDIATE = "immediate"
    FROM_HANDOVER = "from_handover"
    NOT_APPLICABLE = "not_applicable"


class PlotProjectStatus(enum.StrEnum):
    UNDER_DEVELOPMENT = "under_development"
    COMPLETED = "completed"


class LandAreaUnit(enum.StrEnum):
    ACRES = "acres"
    GUNTAS = "guntas"


class SiteAreaUnit(enum.StrEnum):
    SQUARE_FEET = "sqft"
    SQUARE_YARDS = "sqyd"


class LocalApproval(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    authority: str = Field(min_length=1, max_length=100)
    reference_number: str | None = Field(default=None, max_length=120)


class _DetailsBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("facilities", "configurations", check_fields=False)
    @classmethod
    def _unique_values(cls, value: list[object]) -> list[object]:
        if len(value) != len(set(value)):
            raise ValueError("Values cannot be repeated.")
        return value


class ProjectResidenceDetails(_DetailsBase):
    kind: Literal["project_residence"] = "project_residence"
    project_name: str = Field(min_length=1, max_length=200)
    project_area_acres: float = Field(gt=0, le=100000)
    number_of_towers: int = Field(ge=1, le=1000)
    total_units: int = Field(ge=1, le=100000)
    configurations: list[ResidentialConfiguration] = Field(min_length=1, max_length=6)
    unit_or_plot_area_sqft: int = Field(gt=0, le=10_000_000)
    uds_sqft: int | None = Field(default=None, gt=0, le=10_000_000)
    price_per_sqft_paise: int = Field(gt=0)
    sale_type: SaleType | None = None
    expected_handover_date: date | None = None
    plot_facing: Facing = Facing.NOT_APPLICABLE
    entrance_facing: Facing = Facing.NOT_APPLICABLE
    local_approval: LocalApproval | None = None
    amenities_description: ProjectAmenitiesDescription
    about_project: ProjectAbout


class IndividualPropertyDetails(_DetailsBase):
    kind: Literal["individual_property"] = "individual_property"
    property_use: PropertyUse
    total_land_area: float = Field(gt=0, le=100_000_000)
    land_area_unit: SiteAreaUnit
    built_up_area_sqft: int = Field(gt=0, le=10_000_000)
    number_of_floors: int = Field(ge=1, le=200)
    facing: Facing
    monthly_rental_income_paise: int | None = Field(default=None, ge=0)
    ongoing_loan_status: YesNoUnknown
    about_property: PropertyAbout
    other_information: OtherInformation | None = None


class CommercialPropertyDetails(_DetailsBase):
    kind: Literal["commercial_property"] = "commercial_property"
    ownership_type: CommercialOwnership
    total_area_sqft: int = Field(gt=0, le=100_000_000)
    unit_area_sqft: int = Field(gt=0, le=100_000_000)
    facing: Facing
    sale_type: SaleType | None = None
    rental_income_start: RentalIncomeStart
    monthly_rental_income_paise: int | None = Field(default=None, ge=0)
    local_approval: LocalApproval | None = None
    amenities_description: AmenitiesDescription | None = None
    about_property: PropertyAbout
    other_information: OtherInformation | None = None


class PlotDetails(_DetailsBase):
    kind: Literal["plot"] = "plot"
    project_name: str = Field(min_length=1, max_length=200)
    local_approval: LocalApproval | None = None
    total_project_area_acres: float = Field(gt=0, le=100000)
    plot_size_sqyd: int = Field(gt=0, le=10_000_000)
    total_plots: int = Field(ge=1, le=100000)
    facing: Facing
    price_per_sqyd_paise: int = Field(gt=0)
    sale_type: SaleType | None = None
    project_status: PlotProjectStatus
    amenities_description: AmenitiesDescription | None = None
    about_project: ProjectAbout
    other_information: OtherInformation | None = None


class AgriculturalLandDetails(_DetailsBase):
    kind: Literal["agricultural_land"] = "agricultural_land"
    land_area: float = Field(gt=0, le=100000)
    land_area_unit: LandAreaUnit
    title_details: str = Field(min_length=1, max_length=300)
    facilities: list[FacilityLabel] = Field(default_factory=list, max_length=30)
    ongoing_loan_status: YesNoUnknown
    land_type: str = Field(min_length=1, max_length=120)
    survey_number: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9/ ._-]+$")
    rythu_bandhu_status: YesNoUnknown
    registration_district: str = Field(min_length=1, max_length=120)
    sub_registrar_office: str = Field(min_length=1, max_length=160)
    other_information: OtherInformation | None = None


PropertyStructuredDetails = Annotated[
    ProjectResidenceDetails
    | IndividualPropertyDetails
    | CommercialPropertyDetails
    | PlotDetails
    | AgriculturalLandDetails,
    Field(discriminator="kind"),
]
