"""Property-submission schemas — managed submitter intake, review state out.

The submitter sends structured facets + integer price_paise (never a display
string): price_display is derived server-side at approval so the catalog can't
drift from the paise truth. SubmissionRead exposes the full row incl. review
state; there is no client-authored status/review field.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.property import (
    PROPERTY_CATEGORY_BY_SUBTYPE,
    ConstructionStatus,
    Furnishing,
    ListingIntent,
    PropertyCategory,
    PropertySubtype,
    ReraApplicability,
    ReraVerificationStatus,
)
from app.models.property_submission import SubmissionStatus
from app.schemas.listing_links import ListingLink, StoredListingLinks, normalize_listing_links
from app.schemas.property_details import (
    AgriculturalLandDetails,
    CommercialPropertyDetails,
    IndividualPropertyDetails,
    PlotDetails,
    ProjectResidenceDetails,
    PropertyStructuredDetails,
)

PropertyImageContentType = Literal["image/jpeg", "image/png", "image/webp"]
PropertyPanoramaContentType = Literal["image/jpeg", "image/webp"]
PropertyDocumentContentType = Literal["application/pdf"]
PropertyMediaContentType = PropertyImageContentType | PropertyDocumentContentType

_PRIVATE_KEY_PATTERN = (
    r"^private/property-submissions/staging/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"asset\.(jpg|png|webp|pdf)$"
)


class SubmissionMediaInput(BaseModel):
    kind: Literal["image", "document", "panorama"]
    content_type: PropertyMediaContentType
    object_key: str = Field(min_length=1, max_length=600, pattern=_PRIVATE_KEY_PATTERN)
    position: int = Field(ge=0, le=12)

    @model_validator(mode="after")
    def validate_kind_matches_type(self) -> SubmissionMediaInput:
        is_document = self.content_type == "application/pdf"
        if (self.kind == "document") != is_document:
            raise ValueError("Media kind does not match content type.")
        if self.kind == "panorama" and self.content_type not in {"image/jpeg", "image/webp"}:
            raise ValueError("Panoramas must be JPEG or WebP images.")
        return self


class SubmissionFacts(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    type: str = Field(min_length=1, max_length=40)
    location: str = Field(min_length=1, max_length=160)
    meta: str | None = Field(default=None, max_length=120)
    category: PropertyCategory
    property_subtype: PropertySubtype
    city: str = Field(min_length=1, max_length=120)
    locality: str = Field(min_length=1, max_length=120)
    state: str = Field(min_length=1, max_length=120)
    pincode: str = Field(pattern=r"^[1-9][0-9]{5}$")
    listing_intent: ListingIntent = ListingIntent.SALE
    price_paise: int = Field(gt=0)
    # Rent-only. price_paise carries the monthly rent when listing_intent is
    # "rent", so there is no separate monthly_rent_paise to drift from it.
    security_deposit_paise: int | None = Field(default=None, ge=0)
    minimum_lease_months: int | None = Field(default=None, ge=1, le=600)
    available_from: date | None = None
    listing_links: list[ListingLink] | None = None
    bhk: int = Field(default=0, ge=0)
    area_sqft: int = Field(default=0, ge=0)
    furnishing: Furnishing | None = None
    construction_status: ConstructionStatus | None = None
    amenities: list[str] = Field(default_factory=list, max_length=30)
    age_years: int = Field(default=0, ge=0)
    rera_applicability: ReraApplicability
    rera_number: str | None = Field(default=None, max_length=40)
    structured_details: PropertyStructuredDetails

    @field_validator("rera_number", mode="before")
    @classmethod
    def _blank_rera_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("amenities")
    @classmethod
    def _bounded_unique_amenities(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value or len(value) > 80 for value in normalized):
            raise ValueError("Amenities must be between 1 and 80 characters.")
        if len(normalized) != len(set(normalized)):
            raise ValueError("Amenities cannot be repeated.")
        return normalized

    @model_validator(mode="after")
    def validate_property_subtype(self) -> SubmissionFacts:
        if PROPERTY_CATEGORY_BY_SUBTYPE[self.property_subtype] != self.category:
            raise ValueError("Property subtype does not belong to the selected category.")
        project_subtypes = {
            PropertySubtype.STANDALONE_APARTMENT,
            PropertySubtype.GATED_COMMUNITY_APARTMENT,
            PropertySubtype.VILLA,
        }
        commercial_subtypes = {PropertySubtype.LOCKED_SPACE, PropertySubtype.UNLOCKED_SPACE}
        agricultural_subtypes = {PropertySubtype.FARMLAND, PropertySubtype.AGRILAND}

        if self.property_subtype in project_subtypes:
            if not isinstance(self.structured_details, ProjectResidenceDetails):
                raise ValueError("Project residences require project residence details.")
            if self.furnishing is None or self.construction_status is None:
                raise ValueError("Project residences require construction and furnishing status.")
            if self.area_sqft != self.structured_details.unit_or_plot_area_sqft:
                raise ValueError("Area must match the unit or plot area.")
            if (
                self.construction_status == ConstructionStatus.UNDER_CONSTRUCTION
                and self.structured_details.expected_handover_date is None
            ):
                raise ValueError("Under-construction projects require an expected handover date.")
        elif self.property_subtype == PropertySubtype.INDIVIDUAL_HOUSE:
            if not isinstance(self.structured_details, IndividualPropertyDetails):
                raise ValueError("Individual houses require individual property details.")
            if self.area_sqft != self.structured_details.built_up_area_sqft:
                raise ValueError("Area must match the total built-up area.")
            if self.furnishing is not None or self.construction_status is not None:
                raise ValueError("Individual-property status belongs in its subtype details.")
        elif self.property_subtype in commercial_subtypes:
            if not isinstance(self.structured_details, CommercialPropertyDetails):
                raise ValueError("Commercial properties require commercial property details.")
            if self.furnishing is None or self.construction_status is None:
                raise ValueError(
                    "Commercial properties require construction and furnishing status."
                )
            if self.area_sqft != self.structured_details.unit_area_sqft:
                raise ValueError("Area must match the commercial unit area.")
        elif self.property_subtype == PropertySubtype.PLOT:
            if not isinstance(self.structured_details, PlotDetails):
                raise ValueError("Plots require plot details.")
            if self.area_sqft != self.structured_details.plot_size_sqyd * 9:
                raise ValueError("Area must match plot size converted to square feet.")
            if self.furnishing is not None or self.construction_status is not None:
                raise ValueError("Plots do not accept furnishing or construction status.")
        elif self.property_subtype in agricultural_subtypes:
            if not isinstance(self.structured_details, AgriculturalLandDetails):
                raise ValueError("Agricultural listings require agricultural land details.")
            if self.area_sqft != 0:
                raise ValueError("Agricultural land area belongs in its unit-aware details.")
            if self.furnishing is not None or self.construction_status is not None:
                raise ValueError(
                    "Agricultural land does not accept furnishing or construction status."
                )
        return self

    @model_validator(mode="after")
    def validate_listing_intent(self) -> SubmissionFacts:
        """Keep sale-only and rent-only fields from coexisting.

        Both directions matter. Requiring deposit + minimum term on a rental is
        obvious; rejecting them on a sale listing is what stops an author who
        switches a draft from Rent back to Sale from silently shipping a
        catalogue row that still advertises a deposit.
        """

        details = self.structured_details
        sale_type = getattr(details, "sale_type", None)
        has_sale_type_field = hasattr(details, "sale_type")

        if self.listing_intent == ListingIntent.RENT:
            if self.security_deposit_paise is None:
                raise ValueError("Rental listings require a security deposit.")
            if self.minimum_lease_months is None:
                raise ValueError("Rental listings require a minimum lease duration.")
            if sale_type is not None:
                raise ValueError("Rental listings do not accept a sale type.")
        else:
            if self.security_deposit_paise is not None:
                raise ValueError("Only rental listings accept a security deposit.")
            if self.minimum_lease_months is not None:
                raise ValueError("Only rental listings accept a minimum lease duration.")
            if self.available_from is not None:
                raise ValueError("Only rental listings accept an availability date.")
            if has_sale_type_field and sale_type is None:
                raise ValueError("Sale listings require a sale type.")

        self.listing_links = normalize_listing_links(self.listing_links)
        return self


class SubmissionCreate(SubmissionFacts):
    media: list[SubmissionMediaInput] = Field(min_length=1, max_length=13)

    @model_validator(mode="after")
    def validate_submission(self) -> SubmissionCreate:
        images = [asset for asset in self.media if asset.kind == "image"]
        documents = [asset for asset in self.media if asset.kind == "document"]
        panoramas = [asset for asset in self.media if asset.kind == "panorama"]
        if not 1 <= len(images) <= 10:
            raise ValueError("A submission requires between one and ten images.")
        if len(documents) > 2:
            raise ValueError("A submission may include at most two PDF documents.")
        if len(panoramas) > 1:
            raise ValueError("A submission may include at most one panorama.")
        keys = [asset.object_key for asset in self.media]
        positions = [asset.position for asset in self.media]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate media object keys are not allowed.")
        if len(positions) != len(set(positions)):
            raise ValueError("Duplicate media positions are not allowed.")
        return self


class SubmissionUpdate(SubmissionFacts):
    """Editable listing facts; managed media remains immutable after intake."""


class AdminPropertyCorrection(SubmissionUpdate):
    """Full replacement facts plus the reason for an approved-listing correction."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    reason: str = Field(min_length=1, max_length=1000)


class SubmissionMediaRead(BaseModel):
    id: UUID
    kind: Literal["image", "document", "panorama"]
    content_type: str
    size_bytes: int
    position: int
    processing_status: Literal["pending", "processing", "ready", "failed"]
    processing_error_code: str | None


class SubmissionRead(BaseModel):
    id: UUID
    submitter_uuid: UUID
    status: SubmissionStatus
    review_note: str | None
    reviewed_by_uuid: UUID | None
    reviewed_at: datetime | None
    approved_property_id: UUID | None
    listing_intent: ListingIntent
    title: str
    type: str
    location: str
    meta: str | None
    image: str | None
    category: PropertyCategory
    property_subtype: PropertySubtype | None
    city: str
    locality: str
    state: str | None
    pincode: str
    price_paise: int
    security_deposit_paise: int | None
    minimum_lease_months: int | None
    available_from: date | None
    listing_links: StoredListingLinks
    bhk: int
    area_sqft: int
    furnishing: Furnishing | None
    construction_status: ConstructionStatus | None
    amenities: list[str]
    age_years: int
    rera_applicability: ReraApplicability
    rera_number: str | None
    rera_verification_status: ReraVerificationStatus
    rera_verified_at: datetime | None
    details: dict
    details_version: int | None
    structured_details: PropertyStructuredDetails | None
    created_at: datetime
    updated_at: datetime
    media: list[SubmissionMediaRead] = Field(default_factory=list)


class SubmissionListResponse(BaseModel):
    submissions: list[SubmissionRead]


class RejectRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


class ReraReviewRequest(BaseModel):
    """One registry outcome, including withdrawing an earlier one.

    `not_reviewed` is the un-verify: an Admin who verified the wrong row, or who
    learns the registry entry changed, has to be able to take the claim back.
    Like the other non-obvious outcomes it carries a mandatory note, so the audit
    trail records *why* a verification was withdrawn rather than only that it was.
    """

    status: ReraVerificationStatus
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_review(self) -> ReraReviewRequest:
        if (
            self.status
            in {
                ReraVerificationStatus.MISMATCH,
                ReraVerificationStatus.EXEMPTION_VERIFIED,
                ReraVerificationStatus.NOT_REVIEWED,
            }
            and not (self.note or "").strip()
        ):
            raise ValueError("This review outcome requires a note.")
        return self


class PropertyMediaUploadRequest(BaseModel):
    kind: Literal["image", "document", "panorama"]
    content_type: PropertyMediaContentType

    @model_validator(mode="after")
    def validate_kind_matches_type(self) -> PropertyMediaUploadRequest:
        is_document = self.content_type == "application/pdf"
        if (self.kind == "document") != is_document:
            raise ValueError("Media kind does not match content type.")
        if self.kind == "panorama" and self.content_type not in {"image/jpeg", "image/webp"}:
            raise ValueError("Panoramas must be JPEG or WebP images.")
        return self


class PropertyMediaUploadResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class SubmissionMediaAccessResponse(BaseModel):
    url: str
