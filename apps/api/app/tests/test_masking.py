"""Regression tests for display-safe masking helpers."""

from app.core.masking import mask_cheque_reference


def test_cheque_mask_never_reveals_an_entire_short_reference() -> None:
    reference = "A123"

    masked = mask_cheque_reference(reference)

    assert masked == "Cheque ••••"
    assert reference not in masked


def test_cheque_mask_reveals_only_the_last_four_of_a_long_reference() -> None:
    reference = "CHQ-2026-001234"

    masked = mask_cheque_reference(reference)

    assert masked == "Cheque ••••1234"
    assert reference not in masked
