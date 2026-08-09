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
