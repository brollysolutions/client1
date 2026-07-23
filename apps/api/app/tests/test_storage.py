"""services/storage.py — presigned URL generation is a pure local signing
operation (boto3 never calls the network for this), so these run without a
reachable minio/Spaces endpoint."""

from __future__ import annotations

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
