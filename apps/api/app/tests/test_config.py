"""Settings guard tests — the SECRET_KEY fail-fast (security review HIGH 1)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import _INSECURE_DEFAULT_SECRET, Settings

_GOOD_KEY = "x" * 48


def test_default_secret_rejected_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="production", SECRET_KEY=_INSECURE_DEFAULT_SECRET)


def test_short_secret_rejected_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(ENV="production", SECRET_KEY="tooshort")


def test_good_secret_accepted_in_production() -> None:
    s = Settings(ENV="production", SECRET_KEY=_GOOD_KEY)
    assert s.SECRET_KEY == _GOOD_KEY


def test_default_secret_allowed_in_development() -> None:
    # Dev keeps the committed default so the stack boots without extra setup.
    s = Settings(ENV="development", SECRET_KEY=_INSECURE_DEFAULT_SECRET)
    assert s.ENV == "development"
