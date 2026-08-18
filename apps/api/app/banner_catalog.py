"""Closed public banner placement/category catalogue.

The keys mirror the public web routes' canonical product and property ids.
They are code-owned vocabulary: Admin versions artwork for a category but
cannot invent a category that no public placement knows how to present.
"""

from __future__ import annotations

from app.models.banner import BannerPlacement

HOMEPAGE_CATEGORIES = {
    "loans": "Loans",
    "offers": "Attractive offers",
    "general": "General",
    "properties": "Properties",
    "referrals": "Referral programmes",
    "core-concepts": "How Dhanadhara works",
}

FINANCIAL_SERVICE_CATEGORIES = {
    "personal-loan": "Personal Loan",
    "business-loan": "Business Loan",
    "home-loan": "Home Loan",
    "loan-against-property": "Loan Against Property",
    "car-loan": "Car Loan",
    "vehicle-loan": "Vehicle Loan",
    "education-loan": "Education Loan",
    "school-funding": "School Funding",
    "secured-loans": "Secured Loans",
    "od-and-dod": "OD and DOD",
    "project-funding": "Project Funding",
    "life-insurance": "Life Insurance",
    "health-insurance": "Health Insurance",
    "property-insurance": "Property Insurance",
    "travel-insurance": "Travel Insurance",
    "credit-cards": "Credit Cards",
}

PROPERTY_CATEGORIES = {
    "apartments": "Apartments",
    "houses": "Houses",
    "villas": "Villas",
    "plots-land": "Plots and Land",
    "commercial": "Commercial",
    "offers": "Property offers",
    "guidance-general": "Property guidance",
}

CATEGORIES_BY_PLACEMENT: dict[BannerPlacement, dict[str, str]] = {
    BannerPlacement.HOMEPAGE: HOMEPAGE_CATEGORIES,
    BannerPlacement.FINANCIAL_SERVICES: FINANCIAL_SERVICE_CATEGORIES,
    BannerPlacement.PROPERTIES: PROPERTY_CATEGORIES,
    BannerPlacement.DASHBOARD: {},
}


def category_label(placement: BannerPlacement, key: str) -> str | None:
    return CATEGORIES_BY_PLACEMENT[placement].get(key)


def expected_business_line(placement: BannerPlacement) -> str | None:
    if placement == BannerPlacement.FINANCIAL_SERVICES:
        return "loans"
    if placement == BannerPlacement.PROPERTIES:
        return "real_estate"
    return None
