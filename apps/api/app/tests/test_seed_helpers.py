"""Regression coverage for development-only synthetic seed values."""

from __future__ import annotations

import re

import pytest

from app.scripts.seed_helpers import dev_indian_mobile, dev_seed_email


def test_dev_indian_mobile_has_ten_digit_indian_local_number() -> None:
    numbers = [dev_indian_mobile() for _ in range(20)]

    assert all(re.fullmatch(r"\+91[6-9]\d{9}", number) for number in numbers)


def test_dev_seed_email_normalizes_valid_address() -> None:
    assert dev_seed_email("Admin@EXAMPLE.com") == "Admin@example.com"


def test_dev_seed_email_rejects_reserved_domain() -> None:
    with pytest.raises(ValueError, match="non-reserved"):
        dev_seed_email("admin.local@example.test")
