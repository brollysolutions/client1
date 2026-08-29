"""Database-independent checks for intent-aware catalogue price rendering.

``price_paise`` carries the sale price for a sale listing and the monthly rent
for a rental, so the derived ``price_display`` string has to branch on intent.
Rendering a rent through the lakh/crore formatter produces "₹0.25 L", which
reads as a sale price and is useless to a tenant — these tests pin that apart.
"""

from __future__ import annotations

import pytest

from app.models.property import ListingIntent
from app.services.property_submissions import (
    format_inr_amount,
    format_inr_display,
    format_inr_rent,
)


@pytest.mark.parametrize(
    ("paise", "expected"),
    [
        (78_00_000_00, "₹78 L"),
        (2_60_00_000_00, "₹2.6 Cr"),
        (1_00_00_000_00, "₹1 Cr"),
        (50_00_000_00, "₹50 L"),
    ],
)
def test_sale_amounts_render_in_lakhs_and_crores(paise: int, expected: str) -> None:
    assert format_inr_amount(paise) == expected


@pytest.mark.parametrize(
    ("paise", "expected"),
    [
        (25_000_00, "₹25,000/month"),
        (1_25_000_00, "₹1,25,000/month"),
        (9_500_00, "₹9,500/month"),
        (750_00, "₹750/month"),
        (12_00_000_00, "₹12,00,000/month"),
    ],
)
def test_rents_render_as_exact_grouped_rupees(paise: int, expected: str) -> None:
    """Indian grouping: ₹1,25,000 rather than ₹125,000."""
    assert format_inr_rent(paise) == expected


def test_display_branches_on_listing_intent() -> None:
    rent_paise = 25_000_00

    assert format_inr_display(rent_paise, ListingIntent.RENT) == "₹25,000/month"
    assert format_inr_display(rent_paise, ListingIntent.SALE) == "₹0.25 L"


def test_display_defaults_to_sale() -> None:
    """Every row that predates listing_intent was a sale listing."""
    assert format_inr_display(78_00_000_00) == "₹78 L"
