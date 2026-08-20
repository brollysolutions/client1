"""Database-independent validation for managed property-submission media."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.property_submissions import SubmissionCreate


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
        "pincode": "411045",
        "price_paise": 5_000_000,
        "furnishing": "semi",
        "construction_status": "ready",
        "rera_number": "RERA/MEDIA/SCHEMA",
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
