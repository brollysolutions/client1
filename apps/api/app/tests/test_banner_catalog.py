from app.banner_catalog import (
    CATEGORIES_BY_PLACEMENT,
    expected_business_line,
    property_category_matches_campaign,
)
from app.models.banner import BannerPlacement
from app.models.property import PropertyCategory, PropertySubtype


def test_closed_catalog_contains_38_public_categories() -> None:
    public_categories = {
        placement: categories
        for placement, categories in CATEGORIES_BY_PLACEMENT.items()
        if placement != BannerPlacement.DASHBOARD
    }
    assert sum(len(categories) for categories in public_categories.values()) == 38
    assert len(public_categories[BannerPlacement.HOMEPAGE]) == 6
    assert len(public_categories[BannerPlacement.FINANCIAL_SERVICES]) == 16
    assert len(public_categories[BannerPlacement.PROPERTIES]) == 16
    assert expected_business_line(BannerPlacement.FINANCIAL_SERVICES) == "loans"
    assert expected_business_line(BannerPlacement.PROPERTIES) == "real_estate"


def test_property_campaign_categories_are_closed_and_placement_specific() -> None:
    assert property_category_matches_campaign(
        BannerPlacement.HOMEPAGE, "properties", PropertyCategory.VILLAS
    )
    assert property_category_matches_campaign(
        BannerPlacement.PROPERTIES, "villas", PropertyCategory.VILLAS
    )
    assert property_category_matches_campaign(
        BannerPlacement.PROPERTIES, "plots-land", PropertyCategory.PLOTS
    )
    assert property_category_matches_campaign(
        BannerPlacement.PROPERTIES,
        "gated-community-apartment",
        PropertyCategory.APARTMENTS,
        PropertySubtype.GATED_COMMUNITY_APARTMENT,
    )
    assert not property_category_matches_campaign(
        BannerPlacement.PROPERTIES,
        "standalone-apartment",
        PropertyCategory.APARTMENTS,
        PropertySubtype.GATED_COMMUNITY_APARTMENT,
    )
    assert not property_category_matches_campaign(
        BannerPlacement.PROPERTIES, "apartments", PropertyCategory.VILLAS
    )
    assert not property_category_matches_campaign(
        BannerPlacement.FINANCIAL_SERVICES, "home-loan", PropertyCategory.HOUSES
    )
    assert not property_category_matches_campaign(
        BannerPlacement.HOMEPAGE, "general", PropertyCategory.COMMERCIAL
    )
