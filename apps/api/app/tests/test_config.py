"""Settings guard tests — SECRET_KEY and storage-credential fail-fasts
(security review HIGH 1; storage guard added alongside the employee
document-upload slice)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import _INSECURE_DEFAULT_SECRET, Settings

_GOOD_KEY = "x" * 48
# Any prod test that isn't specifically exercising the storage guard needs
# real-shaped Spaces settings too, since Settings validates both together.
_REAL_SPACES = {
    "SPACES_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
    "SPACES_ACCESS_KEY": "real-access-key",
    "SPACES_SECRET_KEY": "real-secret-key",
    "PUBLIC_WEB_ORIGIN": "https://app.example.com",
    "MEDIA_MALWARE_SCAN_MODE": "clamav",
    "MEDIA_VIDEO_PROCESSOR_URL": "http://media-runtime:8080",
}


def test_default_secret_rejected_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="production", SECRET_KEY=_INSECURE_DEFAULT_SECRET, **_REAL_SPACES)


def test_short_secret_rejected_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="production", SECRET_KEY="tooshort", **_REAL_SPACES)


def test_good_secret_accepted_in_production() -> None:
    s = Settings(ENV="production", SECRET_KEY=_GOOD_KEY, **_REAL_SPACES)
    assert s.SECRET_KEY == _GOOD_KEY


def test_default_secret_allowed_in_development() -> None:
    # Dev keeps the committed default so the stack boots without extra setup.
    s = Settings(ENV="development", SECRET_KEY=_INSECURE_DEFAULT_SECRET)
    assert s.ENV == "development"


def test_placeholder_storage_credentials_rejected_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="production", SECRET_KEY=_GOOD_KEY)


def test_placeholder_storage_endpoint_rejected_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENV="production",
            SECRET_KEY=_GOOD_KEY,
            SPACES_ACCESS_KEY="real-access-key",
            SPACES_SECRET_KEY="real-secret-key",
        )


def test_real_storage_credentials_accepted_in_production() -> None:
    s = Settings(ENV="production", SECRET_KEY=_GOOD_KEY, **_REAL_SPACES)
    assert s.SPACES_ACCESS_KEY == "real-access-key"


def test_placeholder_storage_credentials_allowed_in_development() -> None:
    s = Settings(ENV="development", SECRET_KEY=_INSECURE_DEFAULT_SECRET)
    assert s.SPACES_ACCESS_KEY == "minioadmin"


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "null",
        "app.example.com",
        "https://user@app.example.com",
        "https://app.example.com:invalid",
        "https://app.example.com/",
        "https://app.example.com/path",
        "https://app.example.com?tenant=loans",
        "https://app.example.com#fragment",
        "ftp://app.example.com",
    ],
)
def test_cors_origins_must_be_explicit_http_origins(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="development", ALLOWED_ORIGINS=[origin])


def test_explicit_cors_origins_are_preserved() -> None:
    origins = ["http://localhost:3001", "https://app.example.com"]

    configured = Settings(ENV="development", ALLOWED_ORIGINS=origins)

    assert origins == configured.ALLOWED_ORIGINS


def test_default_local_web_origin_uses_port_3001() -> None:
    configured = Settings(ENV="development")

    assert configured.ALLOWED_ORIGINS == ["http://localhost:3001"]
    assert configured.PUBLIC_WEB_ORIGIN == "http://localhost:3001"


def test_empty_cors_origin_list_remains_fail_closed() -> None:
    configured = Settings(ENV="development", ALLOWED_ORIGINS=[])

    assert configured.ALLOWED_ORIGINS == []


@pytest.mark.parametrize(
    ("override", "value"),
    [
        ("PUSH_ENDPOINT_ALLOWED_HOSTS", ""),
        ("PUSH_DELIVERY_TIMEOUT_SECONDS", 0),
        ("TASK_DOCUMENT_MAX_UPLOAD_BYTES", 0),
        ("TASK_DOCUMENT_MAX_PER_TASK", 0),
        ("TASK_DOCUMENT_PRESIGN_LIMIT_PER_HOUR", 0),
        ("ARGON2_CONCURRENCY", 0),
        ("SCHEDULER_JOB_CONCURRENCY", 0),
        ("MEDIA_PROCESS_CONCURRENCY", 0),
        ("MEDIA_PROCESS_BATCH_SIZE", 0),
    ],
)
def test_security_limits_must_be_positive_or_nonempty(override: str, value: object) -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="development", **{override: value})


def test_disabled_media_scanner_rejected_outside_development() -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENV="production",
            SECRET_KEY=_GOOD_KEY,
            MEDIA_MALWARE_SCAN_MODE="disabled",
            **{
                key: value
                for key, value in _REAL_SPACES.items()
                if key != "MEDIA_MALWARE_SCAN_MODE"
            },
        )


def test_clamav_media_scanner_accepted_outside_development() -> None:
    settings = Settings(ENV="production", SECRET_KEY=_GOOD_KEY, **_REAL_SPACES)
    assert settings.MEDIA_MALWARE_SCAN_MODE == "clamav"


def test_compact_runtime_concurrency_is_configurable() -> None:
    configured = Settings(
        ENV="production",
        SECRET_KEY=_GOOD_KEY,
        ARGON2_CONCURRENCY=2,
        SCHEDULER_JOB_CONCURRENCY=1,
        **_REAL_SPACES,
    )

    assert configured.ARGON2_CONCURRENCY == 2
    assert configured.SCHEDULER_JOB_CONCURRENCY == 1


@pytest.mark.parametrize(
    ("override", "value"),
    [
        ("ARGON2_CONCURRENCY", 9),
        ("SCHEDULER_JOB_CONCURRENCY", 5),
        ("MEDIA_PROCESS_CONCURRENCY", 5),
        ("MEDIA_PROCESS_BATCH_SIZE", 5),
    ],
)
def test_runtime_concurrency_rejects_unsafe_upper_bounds(override: str, value: int) -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="development", **{override: value})


def test_isolated_media_processor_is_required_outside_development() -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENV="production",
            SECRET_KEY=_GOOD_KEY,
            **{
                key: value
                for key, value in _REAL_SPACES.items()
                if key != "MEDIA_VIDEO_PROCESSOR_URL"
            },
        )


@pytest.mark.parametrize(
    "processor_url",
    [
        "file:///tmp/media.sock",
        "http://user:secret@media-runtime:8080",
        "http://media-runtime:8080/transcode",
        "http://media-runtime:8080/",
        "http://media-runtime",
        "https://processor.example.com:443",
        "http://127.0.0.1:8080",
        "http://media-runtime:8081",
    ],
)
def test_media_processor_url_rejects_unsafe_or_ambiguous_shapes(processor_url: str) -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENV="production",
            SECRET_KEY=_GOOD_KEY,
            **{**_REAL_SPACES, "MEDIA_VIDEO_PROCESSOR_URL": processor_url},
        )


def test_non_https_storage_endpoint_rejected_in_production() -> None:
    # A real (non-placeholder) endpoint that's still plain http:// must also
    # be rejected outside dev — presigned URLs carry the SigV4 signature (and
    # upload bytes) over the wire.
    with pytest.raises(ValidationError):
        Settings(
            ENV="production",
            SECRET_KEY=_GOOD_KEY,
            SPACES_ENDPOINT_URL="http://spaces.example.com",
            SPACES_ACCESS_KEY="real-access-key",
            SPACES_SECRET_KEY="real-secret-key",
        )
