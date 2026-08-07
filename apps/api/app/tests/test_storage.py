"""services/storage.py — presigned URL generation is a pure local signing
operation (boto3 never calls the network for this), so these run without a
reachable minio/Spaces endpoint."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from app.core.config import settings
from app.services import storage


def test_presign_upload_returns_url_for_bucket_and_key() -> None:
    url = storage.presign_upload("tasks/abc/def-pan", "application/pdf")
    assert url.startswith("http")
    assert "tasks/abc/def-pan" in url


def test_presign_download_returns_url_for_key() -> None:
    url = storage.presign_download("tasks/abc/def-pan")
    assert url.startswith("http")
    assert "tasks/abc/def-pan" in url


def test_presign_preview_returns_inline_get_without_attachment_override() -> None:
    url = storage.presign_preview("private/property-submissions/abc/image.jpg")
    assert url.startswith("http")
    assert "private/property-submissions/abc/image.jpg" in url
    assert "response-content-disposition" not in url.lower()


def test_copy_object_replaces_metadata_with_verified_content_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = MagicMock()
    monkeypatch.setattr(storage, "_client", lambda _endpoint: client)

    storage.copy_object("private/source.jpg", "public/properties/target.jpg", "image/jpeg")

    client.copy_object.assert_called_once_with(
        Bucket=settings.SPACES_BUCKET,
        Key="public/properties/target.jpg",
        CopySource={"Bucket": settings.SPACES_BUCKET, "Key": "private/source.jpg"},
        ContentType="image/jpeg",
        MetadataDirective="REPLACE",
    )


def test_delete_object_swallows_unreachable_endpoint() -> None:
    # No live storage service in this test process — delete_object must not
    # raise (best-effort per the DB row being the source of truth).
    storage.delete_object("tasks/abc/def-pan")


def test_presign_uses_public_endpoint_when_set() -> None:
    # Presigned URLs go to the browser, which can't resolve the internal
    # container-network hostname — they must be signed against the public
    # endpoint when one is configured (docker-compose.dev.yml sets this to
    # the host-published minio port; prod leaves it unset).
    original = settings.SPACES_PUBLIC_ENDPOINT_URL
    settings.SPACES_PUBLIC_ENDPOINT_URL = "http://localhost:9000"
    try:
        url = storage.presign_upload("tasks/abc/def-pan", "application/pdf")
        assert url.startswith("http://localhost:9000/")
    finally:
        settings.SPACES_PUBLIC_ENDPOINT_URL = original


def test_presign_falls_back_to_internal_endpoint_when_public_unset() -> None:
    original = settings.SPACES_PUBLIC_ENDPOINT_URL
    settings.SPACES_PUBLIC_ENDPOINT_URL = ""
    try:
        url = storage.presign_upload("tasks/abc/def-pan", "application/pdf")
        assert url.startswith(settings.SPACES_ENDPOINT_URL)
    finally:
        settings.SPACES_PUBLIC_ENDPOINT_URL = original


def test_presign_upload_post_signs_size_cap_into_policy() -> None:
    url, fields = storage.presign_upload_post(
        "agent-applications/abc/def-photo", "image/jpeg", max_bytes=5 * 1024 * 1024
    )
    assert url.startswith("http")
    assert fields["key"] == "agent-applications/abc/def-photo"
    assert fields["Content-Type"] == "image/jpeg"

    policy_json = base64.b64decode(fields["policy"])
    policy = json.loads(policy_json)
    conditions = policy["conditions"]
    length_range = next(
        c for c in conditions if isinstance(c, list) and c[0] == "content-length-range"
    )
    assert length_range == ["content-length-range", 1, 5 * 1024 * 1024]


def test_presign_upload_post_uses_public_endpoint_when_set() -> None:
    original = settings.SPACES_PUBLIC_ENDPOINT_URL
    settings.SPACES_PUBLIC_ENDPOINT_URL = "http://localhost:9000"
    try:
        url, _fields = storage.presign_upload_post(
            "agent-applications/abc/def-photo", "image/jpeg", max_bytes=1024
        )
        assert url.startswith("http://localhost:9000/")
    finally:
        settings.SPACES_PUBLIC_ENDPOINT_URL = original


class _FakeS3Client:
    def __init__(self, error_code: str | None, size: int = 1024) -> None:
        self._error_code = error_code
        self._size = size

    def head_object(self, Bucket: str, Key: str) -> dict:  # noqa: N803 — boto3 param casing
        if self._error_code is not None:
            raise ClientError({"Error": {"Code": self._error_code, "Message": "x"}}, "HeadObject")
        return {"ContentLength": self._size}


def test_head_object_returns_none_for_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(storage, "_client", lambda _endpoint: _FakeS3Client("404"))
    assert storage.head_object("agent-applications/abc/def-photo") is None


def test_head_object_returns_size_for_existing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(storage, "_client", lambda _endpoint: _FakeS3Client(None, size=2048))
    assert storage.head_object("agent-applications/abc/def-photo") == 2048


def test_head_object_reraises_on_transport_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    # A non-404 ClientError (e.g. connection/auth failure surfaced as 500) must
    # propagate, not be swallowed into None — submit() depends on this to fail
    # closed with a 502 rather than silently accepting an unverified upload.
    monkeypatch.setattr(storage, "_client", lambda _endpoint: _FakeS3Client("500"))
    with pytest.raises(ClientError):
        storage.head_object("agent-applications/abc/def-photo")


def test_public_asset_url_builds_a_url_for_a_public_key() -> None:
    url = storage.public_asset_url("public/banners/abc-123/hero.jpg")
    assert url is not None
    assert url.startswith("http")
    assert url.endswith(f"/{storage.settings.SPACES_BUCKET}/public/banners/abc-123/hero.jpg")


def test_public_asset_url_returns_none_for_a_kyc_key_shape() -> None:
    # The boundary this function exists to enforce: a real agent-application
    # KYC object key (or task-document/loan-document key) must never resolve
    # to a servable URL, regardless of what a caller passes in.
    assert storage.public_asset_url("agent-applications/abc-123/deadbeefdeadbeef-photo") is None
    assert storage.public_asset_url("tasks/abc-123/def-doc") is None
    assert storage.public_asset_url("agent-applications/abc-123/deadbeef-aadhaar_front") is None


def test_public_asset_url_returns_none_for_a_bare_public_prefix() -> None:
    # "public" without the trailing slash must not match -- it isn't actually
    # under the public/ prefix, it just shares the string.
    assert storage.public_asset_url("public") is None
    assert storage.public_asset_url("publicity/banners/x") is None


def test_public_asset_url_uses_public_endpoint_when_set() -> None:
    original = settings.SPACES_PUBLIC_ENDPOINT_URL
    settings.SPACES_PUBLIC_ENDPOINT_URL = "http://localhost:9000"
    try:
        url = storage.public_asset_url("public/banners/abc-123/hero.jpg")
        assert url is not None
        assert url.startswith("http://localhost:9000/")
    finally:
        settings.SPACES_PUBLIC_ENDPOINT_URL = original
