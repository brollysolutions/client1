"""Regression coverage for development-only synthetic seed values."""

from __future__ import annotations

import re

from app.scripts.seed_helpers import dev_indian_mobile


def test_dev_indian_mobile_has_ten_digit_indian_local_number() -> None:
    numbers = [dev_indian_mobile() for _ in range(20)]

    assert all(re.fullmatch(r"\+91[6-9]\d{9}", number) for number in numbers)
