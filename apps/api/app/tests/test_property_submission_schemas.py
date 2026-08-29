"""Database-independent validation for managed property-submission media."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.listing_links import ListingLink, safe_stored_listing_links
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


def _rent_payload(**overrides: object) -> dict:
    """A valid rent payload: intent flipped, deposit + term added, sale type dropped."""
    payload = _payload([_asset(0)])
    payload["listing_intent"] = "rent"
    payload["security_deposit_paise"] = 15_000_000
    payload["minimum_lease_months"] = 11
    payload["structured_details"].pop("sale_type", None)
    payload.update(overrides)
    return payload


def test_defaults_to_a_sale_listing() -> None:
    parsed = SubmissionCreate.model_validate(_payload([_asset(0)]))

    assert parsed.listing_intent == "sale"
    assert parsed.security_deposit_paise is None
    assert parsed.minimum_lease_months is None


def test_accepts_a_rent_listing_with_terms() -> None:
    parsed = SubmissionCreate.model_validate(_rent_payload(available_from="2026-10-01"))

    assert parsed.listing_intent == "rent"
    assert parsed.security_deposit_paise == 15_000_000
    assert parsed.minimum_lease_months == 11
    assert parsed.available_from.isoformat() == "2026-10-01"


@pytest.mark.parametrize(
    ("drop", "message"),
    [
        ("security_deposit_paise", "require a security deposit"),
        ("minimum_lease_months", "require a minimum lease duration"),
    ],
)
def test_rent_listing_requires_deposit_and_term(drop: str, message: str) -> None:
    payload = _rent_payload()
    del payload[drop]

    with pytest.raises(ValidationError, match=message):
        SubmissionCreate.model_validate(payload)


def test_rent_listing_rejects_a_sale_type() -> None:
    payload = _rent_payload()
    payload["structured_details"]["sale_type"] = "new_sale"

    with pytest.raises(ValidationError, match="do not accept a sale type"):
        SubmissionCreate.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("security_deposit_paise", 15_000_000, "Only rental listings accept a security deposit"),
        ("minimum_lease_months", 11, "Only rental listings accept a minimum lease duration"),
        ("available_from", "2026-10-01", "Only rental listings accept an availability date"),
    ],
)
def test_sale_listing_rejects_rent_only_fields(field: str, value: object, message: str) -> None:
    """A draft switched back from Rent to Sale must not keep advertising a deposit."""
    payload = _payload([_asset(0)])
    payload[field] = value

    with pytest.raises(ValidationError, match=message):
        SubmissionCreate.model_validate(payload)


def test_sale_listing_still_requires_a_sale_type() -> None:
    payload = _payload([_asset(0)])
    payload["structured_details"].pop("sale_type")

    with pytest.raises(ValidationError, match="require a sale type"):
        SubmissionCreate.model_validate(payload)


@pytest.mark.parametrize(
    ("url", "platform"),
    [
        ("https://www.youtube.com/watch?v=abc123", "youtube"),
        ("https://youtu.be/abc123", "youtube"),
        ("https://m.youtube.com/watch?v=abc123", "youtube"),
        ("https://www.instagram.com/reel/abc123/", "instagram"),
        ("https://www.facebook.com/listing/posts/1", "facebook"),
        ("https://fb.watch/abc123/", "facebook"),
    ],
)
def test_derives_the_platform_from_the_allowlisted_host(url: str, platform: str) -> None:
    payload = _payload([_asset(0)])
    payload["listing_links"] = [{"url": url}]

    parsed = SubmissionCreate.model_validate(payload)

    assert parsed.listing_links is not None
    assert parsed.listing_links[0].platform == platform


def test_platform_cannot_be_spoofed_by_the_author() -> None:
    """A YouTube badge must never point somewhere else."""
    payload = _payload([_asset(0)])
    payload["listing_links"] = [
        {"url": "https://www.instagram.com/reel/abc123/", "platform": "youtube"}
    ]

    parsed = SubmissionCreate.model_validate(payload)

    assert parsed.listing_links is not None
    assert parsed.listing_links[0].platform == "instagram"


@pytest.mark.parametrize(
    "url",
    [
        "http://www.youtube.com/watch?v=abc123",  # not HTTPS
        "https://user:pass@www.youtube.com/watch?v=abc123",  # embedded credentials
        "https://youtube.com.evil.example/watch?v=abc123",  # suffix-confusion host
        "https://evil.example/youtube.com",  # path-confusion host
        "https://bit.ly/abc123",  # shortener hides the destination
        "javascript:alert(1)",  # scheme injection
        "//www.youtube.com/watch?v=abc123",  # protocol-relative
    ],
)
def test_rejects_links_outside_the_https_allowlist(url: str) -> None:
    payload = _payload([_asset(0)])
    payload["listing_links"] = [{"url": url}]

    with pytest.raises(ValidationError, match="Listing links must be HTTPS"):
        SubmissionCreate.model_validate(payload)


def test_collapses_duplicate_listing_links() -> None:
    payload = _payload([_asset(0)])
    payload["listing_links"] = [
        {"url": "https://youtu.be/abc123"},
        {"url": "https://youtu.be/abc123"},
    ]

    parsed = SubmissionCreate.model_validate(payload)

    assert parsed.listing_links is not None
    assert len(parsed.listing_links) == 1


def test_rejects_more_than_four_listing_links() -> None:
    payload = _payload([_asset(0)])
    payload["listing_links"] = [{"url": f"https://youtu.be/abc{index}"} for index in range(5)]

    with pytest.raises(ValidationError, match="at most 4 listing links"):
        SubmissionCreate.model_validate(payload)


def test_narrative_link_ban_survives_the_structured_link_field() -> None:
    """The carve-out is the structured field only; free text still rejects URLs."""
    payload = _payload([_asset(0)])
    payload["listing_links"] = [{"url": "https://youtu.be/abc123"}]
    # Digit-free so the link rule is what fires, not the separate numbers rule.
    payload["structured_details"]["about_project"] = (
        "A calm community, see https://youtu.be/walkthrough for the tour."
    )

    with pytest.raises(ValidationError, match="cannot contain links"):
        SubmissionCreate.model_validate(payload)


def test_stored_links_are_filtered_not_raised_on_read() -> None:
    """A stored link that no longer passes the allowlist must not 500 a read.

    Read projections re-check every stored link. If that check raised instead of
    filtering, one bad row would take the whole catalogue down for everyone
    rather than hiding a single link -- the same failure mode
    `_public_property_data` already contains for malformed structured_details.
    """
    safe = safe_stored_listing_links(
        [
            {"url": "https://youtu.be/walkthrough", "platform": "youtube"},
            {"url": "https://phish.example/steal", "platform": "youtube"},
            {"url": "http://www.youtube.com/insecure", "platform": "youtube"},
            "not-a-dict",
            {"platform": "youtube"},
        ]
    )

    assert safe == [{"url": "https://youtu.be/walkthrough", "platform": "youtube"}]


def test_stored_platform_is_re_derived_on_read() -> None:
    safe = safe_stored_listing_links(
        [{"url": "https://www.instagram.com/reel/tour/", "platform": "youtube"}]
    )

    assert safe == [{"url": "https://www.instagram.com/reel/tour/", "platform": "instagram"}]


def test_stored_links_collapse_to_none_when_nothing_survives() -> None:
    assert safe_stored_listing_links([{"url": "https://phish.example/x"}]) is None
    assert safe_stored_listing_links(None) is None
    assert safe_stored_listing_links("garbage") is None


def test_stored_links_accept_already_built_models() -> None:
    """Constructing a read model directly must not silently drop every link."""
    safe = safe_stored_listing_links(
        [
            ListingLink(url="https://youtu.be/walkthrough"),
            ListingLink(url="https://www.facebook.com/listing/posts/one"),
        ]
    )

    assert safe == [
        {"url": "https://youtu.be/walkthrough", "platform": "youtube"},
        {"url": "https://www.facebook.com/listing/posts/one", "platform": "facebook"},
    ]
