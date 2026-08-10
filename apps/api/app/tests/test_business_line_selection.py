import pytest
from fastapi import HTTPException

from app.core.deps import resolve_effective_business_line


def test_dual_line_staff_selects_a_concrete_operational_line() -> None:
    assert (
        resolve_effective_business_line(
            role="telecaller",
            claimed_business_line="both",
            requested_business_line="real_estate",
        )
        == "real_estate"
    )


def test_dual_line_staff_defaults_to_loans_without_a_selector() -> None:
    assert (
        resolve_effective_business_line(
            role="employee",
            claimed_business_line="both",
            requested_business_line=None,
        )
        == "loans"
    )


def test_single_line_staff_cannot_expand_access_with_the_header() -> None:
    with pytest.raises(HTTPException) as exc_info:
        resolve_effective_business_line(
            role="employee",
            claimed_business_line="loans",
            requested_business_line="real_estate",
        )
    assert exc_info.value.status_code == 403


def test_invalid_dual_line_selector_is_rejected() -> None:
    with pytest.raises(HTTPException) as exc_info:
        resolve_effective_business_line(
            role="telecaller",
            claimed_business_line="both",
            requested_business_line="both",
        )
    assert exc_info.value.status_code == 400
