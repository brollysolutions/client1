"""Database-independent validation for managed property-submission media."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.property_submissions import SubmissionCreate

_PROJECT_AMENITIES = " ".join(["landscaped"] * 150)


def _asset(position: int, *, kind: str = "image", content_type: str = "image/jpeg") -> dict:
    extension = (
        "pdf"
        if content_type == "application/pdf"
        else "webp"
        if content_type == "image/webp"
        else "jpg"
    )
    return {
        "kind": kind,
        "content_type": content_type,
        "object_key": (
            f"private/property-submissions/staging/{uuid.uuid4()}/{uuid.uuid4()}/asset.{extension}"
        ),
        "position": position,
    }


def _payload(media: list[dict]) -> dict:
    return {
        "title": "Managed listing",
        "type": "Apartment",
        "location": "Baner, Pune",
        "category": "apartments",
        "property_subtype": "standalone_apartment",
        "city": "Pune",
        "locality": "Baner",
        "state": "Maharashtra",
        "pincode": "411045",
        "price_paise": 5_000_000,
        "bhk": 2,
        "area_sqft": 1200,
        "furnishing": "semi",
        "construction_status": "ready",
        "rera_applicability": "applicable",
        "rera_number": "RERA/MEDIA/SCHEMA",
        "structured_details": {
            "kind": "project_residence",
            "project_name": "Green Meadows",
            "project_area_acres": 4.5,
            "number_of_towers": 3,
            "total_units": 120,
            "configurations": ["2_bhk", "3_bhk"],
            "unit_or_plot_area_sqft": 1200,
            "price_per_sqft_paise": 750_000,
            "sale_type": "new_sale",
            "plot_facing": "not_applicable",
            "entrance_facing": "east",
            "amenities_description": _PROJECT_AMENITIES,
            "about_project": "A calm community with landscaped gardens and generous shared spaces.",
        },
        "media": media,
    }


def test_accepts_ten_images_and_two_documents() -> None:
    media = [_asset(position) for position in range(10)]
    media.extend(
        _asset(position, kind="document", content_type="application/pdf")
        for position in range(10, 12)
    )

    parsed = SubmissionCreate.model_validate(_payload(media))

    assert len(parsed.media) == 12


def test_accepts_one_managed_panorama() -> None:
    parsed = SubmissionCreate.model_validate(
        _payload([_asset(0), _asset(1, kind="panorama", content_type="image/webp")])
    )

    assert [asset.kind for asset in parsed.media] == ["image", "panorama"]


@pytest.mark.parametrize(
    "media",
    [
        [],
        [_asset(position) for position in range(11)],
        [_asset(0)]
        + [
            _asset(position, kind="document", content_type="application/pdf")
            for position in range(1, 4)
        ],
    ],
)
def test_rejects_media_count_outside_approved_quotas(media: list[dict]) -> None:
    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate(_payload(media))


def test_rejects_kind_content_type_mismatch() -> None:
    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate(_payload([_asset(0, kind="document")]))


def test_rejects_property_video_and_more_than_one_panorama() -> None:
    video = _asset(1, kind="video", content_type="video/mp4")
    video["object_key"] = video["object_key"].removesuffix(".jpg") + ".mp4"
    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate(_payload([_asset(0), video]))

    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate(
            _payload(
                [
                    _asset(0),
                    _asset(1, kind="panorama", content_type="image/webp"),
                    _asset(2, kind="panorama", content_type="image/webp"),
                ]
            )
        )


@pytest.mark.parametrize("duplicate_field", ["object_key", "position"])
def test_rejects_duplicate_media_identifiers(duplicate_field: str) -> None:
    first = _asset(0)
    second = _asset(1)
    second[duplicate_field] = first[duplicate_field]

    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate(_payload([first, second]))


def test_rejects_canonical_key_as_client_input() -> None:
    asset = _asset(0)
    asset["object_key"] = asset["object_key"].replace("/staging/", "/canonical/")

    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate(_payload([asset]))


def test_rejects_subtype_outside_selected_category() -> None:
    payload = _payload([_asset(0)])
    payload["property_subtype"] = "individual_house"

    with pytest.raises(ValidationError, match="does not belong"):
        SubmissionCreate.model_validate(payload)


def test_rera_number_is_optional_for_claimed_exemption() -> None:
    payload = _payload([_asset(0)])
    payload["rera_applicability"] = "exemption_claimed"
    payload["rera_number"] = ""

    parsed = SubmissionCreate.model_validate(payload)

    assert parsed.rera_number is None


def test_project_amenities_require_at_least_one_hundred_fifty_words() -> None:
    payload = _payload([_asset(0)])
    payload["structured_details"]["amenities_description"] = " ".join(["landscaped"] * 149)

    with pytest.raises(ValidationError, match="at least 150 words"):
        SubmissionCreate.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("about_project", "Call 9876 for details", "cannot contain numbers"),
        ("about_project", "See example.com for details", "cannot contain links"),
        ("about_project", "See example.xyz for details", "cannot contain links"),
        ("about_project", "Use ftp://example for details", "cannot contain links"),
        ("amenities_description", "Visit <strong>our clubhouse</strong>", "cannot contain links"),
    ],
)
def test_rejects_unsafe_public_narratives(field: str, value: str, message: str) -> None:
    payload = _payload([_asset(0)])
    payload["structured_details"][field] = value

    with pytest.raises(ValidationError, match=message):
        SubmissionCreate.model_validate(payload)


@pytest.mark.parametrize(
    ("category", "subtype", "area_sqft", "furnishing", "construction", "details", "kind"),
    [
        (
            "houses",
            "individual_house",
            1800,
            None,
            None,
            {
                "kind": "individual_property",
                "property_use": "residential",
                "total_land_area": 240,
                "land_area_unit": "sqyd",
                "built_up_area_sqft": 1800,
                "number_of_floors": 2,
                "facing": "east",
                "ongoing_loan_status": "no",
                "about_property": "A peaceful independent home with generous natural light.",
            },
            "individual_property",
        ),
        (
            "commercial",
            "locked_space",
            1000,
            "semi",
            "ready",
            {
                "kind": "commercial_property",
                "ownership_type": "entity",
                "total_area_sqft": 4000,
                "unit_area_sqft": 1000,
                "facing": "north",
                "sale_type": "resale",
                "rental_income_start": "immediate",
                "about_property": "A well connected commercial unit with flexible working space.",
            },
            "commercial_property",
        ),
        (
            "plots",
            "plot",
            1800,
            None,
            None,
            {
                "kind": "plot",
                "project_name": "Lakeview Enclave",
                "total_project_area_acres": 12,
                "plot_size_sqyd": 200,
                "total_plots": 80,
                "facing": "west",
                "price_per_sqyd_paise": 3_500_000,
                "sale_type": "new_sale",
                "project_status": "completed",
                "about_project": "A planned layout surrounded by open green spaces.",
            },
            "plot",
        ),
        (
            "plots",
            "farmland",
            0,
            None,
            None,
            {
                "kind": "agricultural_land",
                "land_area": 4.5,
                "land_area_unit": "acres",
                "title_details": "Clear registered title",
                "facilities": ["Road access", "Water source"],
                "ongoing_loan_status": "no",
                "land_type": "Dry agricultural land",
                "survey_number": "44/A",
                "rythu_bandhu_status": "yes",
                "registration_district": "Sangareddy",
                "sub_registrar_office": "Patancheru",
            },
            "agricultural_land",
        ),
    ],
)
def test_accepts_each_property_family(
    category: str,
    subtype: str,
    area_sqft: int,
    furnishing: str | None,
    construction: str | None,
    details: dict,
    kind: str,
) -> None:
    payload = _payload([_asset(0)])
    payload.update(
        category=category,
        property_subtype=subtype,
        area_sqft=area_sqft,
        furnishing=furnishing,
        construction_status=construction,
        structured_details=details,
    )

    parsed = SubmissionCreate.model_validate(payload)

    assert parsed.structured_details.kind == kind


def test_rejects_details_for_a_different_property_family() -> None:
    payload = _payload([_asset(0)])
    payload["structured_details"] = {
        "kind": "plot",
        "project_name": "Wrong Family",
        "total_project_area_acres": 12,
        "plot_size_sqyd": 200,
        "total_plots": 80,
        "facing": "west",
        "price_per_sqyd_paise": 3_500_000,
        "sale_type": "new_sale",
        "project_status": "completed",
        "about_project": "A planned layout surrounded by open green spaces.",
    }

    with pytest.raises(ValidationError, match="project residence details"):
        SubmissionCreate.model_validate(payload)


def test_rejects_unbounded_agricultural_facility_labels() -> None:
    payload = _payload([_asset(0)])
    payload.update(
        category="plots",
        property_subtype="farmland",
        area_sqft=0,
        furnishing=None,
        construction_status=None,
        structured_details={
            "kind": "agricultural_land",
            "land_area": 4.5,
            "land_area_unit": "acres",
            "title_details": "Clear registered title",
            "facilities": ["x" * 81],
            "ongoing_loan_status": "no",
            "land_type": "Dry agricultural land",
            "survey_number": "44/A",
            "rythu_bandhu_status": "yes",
            "registration_district": "Sangareddy",
            "sub_registrar_office": "Patancheru",
        },
    )

    with pytest.raises(ValidationError, match="at most 80 characters"):
        SubmissionCreate.model_validate(payload)
