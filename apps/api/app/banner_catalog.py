"""Closed public banner placement/category catalogue.

The keys mirror the public web routes' canonical product and property ids.
They are code-owned vocabulary: Admin versions artwork for a category but
cannot invent a category that no public placement knows how to present.
"""

from __future__ import annotations

from app.models.banner import BannerPlacement
from app.models.property import PropertyCategory, PropertySubtype

HOMEPAGE_CATEGORIES = {
    "loans": "Loans",
    "offers": "Attractive offers",
    "general": "General",
    "properties": "Properties",
    "referrals": "Referral programmes",
    "core-concepts": "How Dhanadhara works",
}

# These themes let Sub Admins select artwork appropriate to the campaign while
# Admin retains control of every immutable artwork version. A dedicated partial
# unique index on the placement (rather than the general placement/category
# index) keeps the public sponsor slot single-occupancy across all six themes.
# The next sponsor waits in the existing replacement queue
# (replaces_banner_id + jobs/cms_activation.py), which swaps it in at its
# starts_at and refuses to displace a banner it does not name.
#
# Deliberately not named "offers": services/banners.py treats that literal as
# magic (a banner in an "offers" category MUST link a live Offer, and any other
# category MUST NOT), which is wrong for a general sponsor slot.
HOMEPAGE_AD_CATEGORIES = {
    "sponsor": "Sponsor strip",
    "personal-finance": "Personal finance",
    "business-finance": "Business finance",
    "cards-and-rewards": "Cards and rewards",
    "insurance-protection": "Insurance and protection",
    "verified-property": "Verified property",
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
    "individual-house": "Individual House",
    "standalone-apartment": "Standalone Apartment",
    "gated-community-apartment": "Gated Community Apartment",
    "villa": "Villa",
    "locked-space": "Locked Commercial Space",
    "unlocked-space": "Unlocked Commercial Space",
    "plot": "Plot",
    "farmland": "Farmland",
    "agriland": "Agriland",
    "apartments": "Apartments",
    "houses": "Houses",
    "villas": "Villas",
    "plots-land": "Plots and Land",
    "commercial": "Commercial",
    "offers": "Property offers",
    "guidance-general": "Property guidance",
}

# category_label() indexes this with [], not .get(), so every BannerPlacement
# member must appear here -- a missing entry is a KeyError surfacing as a 500,
# not a None. The assertion below turns that runtime failure into an
# import-time one that every test run catches.
CATEGORIES_BY_PLACEMENT: dict[BannerPlacement, dict[str, str]] = {
    BannerPlacement.HOMEPAGE: HOMEPAGE_CATEGORIES,
    BannerPlacement.HOMEPAGE_AD: HOMEPAGE_AD_CATEGORIES,
    BannerPlacement.FINANCIAL_SERVICES: FINANCIAL_SERVICE_CATEGORIES,
    BannerPlacement.PROPERTIES: PROPERTY_CATEGORIES,
    BannerPlacement.DASHBOARD: {},
}

if set(CATEGORIES_BY_PLACEMENT) != set(BannerPlacement):  # pragma: no cover
    missing = sorted(p.value for p in set(BannerPlacement) - set(CATEGORIES_BY_PLACEMENT))
    raise RuntimeError(f"CATEGORIES_BY_PLACEMENT is missing placement(s): {missing}")

_PROPERTY_CAMPAIGN_CATEGORY = {
    PropertyCategory.APARTMENTS: "apartments",
    PropertyCategory.HOUSES: "houses",
    PropertyCategory.VILLAS: "villas",
    PropertyCategory.PLOTS: "plots-land",
    PropertyCategory.COMMERCIAL: "commercial",
}

_PROPERTY_CAMPAIGN_SUBTYPE = {
    PropertySubtype.INDIVIDUAL_HOUSE: "individual-house",
    PropertySubtype.STANDALONE_APARTMENT: "standalone-apartment",
    PropertySubtype.GATED_COMMUNITY_APARTMENT: "gated-community-apartment",
    PropertySubtype.VILLA: "villa",
    PropertySubtype.LOCKED_SPACE: "locked-space",
    PropertySubtype.UNLOCKED_SPACE: "unlocked-space",
    PropertySubtype.PLOT: "plot",
    PropertySubtype.FARMLAND: "farmland",
    PropertySubtype.AGRILAND: "agriland",
}


def category_label(placement: BannerPlacement, key: str) -> str | None:
    return CATEGORIES_BY_PLACEMENT[placement].get(key)


def expected_business_line(placement: BannerPlacement) -> str | None:
    if placement == BannerPlacement.FINANCIAL_SERVICES:
        return "loans"
    if placement == BannerPlacement.PROPERTIES:
        return "real_estate"
    return None


def property_category_matches_campaign(
    placement: BannerPlacement,
    category_key: str,
    property_category: PropertyCategory,
    property_subtype: PropertySubtype | None = None,
) -> bool:
    """Return whether a governed public category may promote this listing."""
    if placement == BannerPlacement.HOMEPAGE:
        return category_key == "properties"
    if placement == BannerPlacement.PROPERTIES:
        if property_subtype is not None and category_key in _PROPERTY_CAMPAIGN_SUBTYPE.values():
            return _PROPERTY_CAMPAIGN_SUBTYPE[property_subtype] == category_key
        return _PROPERTY_CAMPAIGN_CATEGORY[property_category] == category_key
    return False
