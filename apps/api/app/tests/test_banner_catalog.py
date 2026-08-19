from app.banner_catalog import (
    CATEGORIES_BY_PLACEMENT,
    expected_business_line,
    property_category_matches_campaign,
)
from app.models.banner import BannerPlacement
from app.models.property import PropertyCategory, PropertySubtype
from app.services.public_catalog import PUBLIC_BANNERS_LIMIT_BY_PLACEMENT


def test_closed_catalog_contains_44_public_categories() -> None:
    public_categories = {
        placement: categories
        for placement, categories in CATEGORIES_BY_PLACEMENT.items()
        if placement != BannerPlacement.DASHBOARD
    }
    assert sum(len(categories) for categories in public_categories.values()) == 44
    assert len(public_categories[BannerPlacement.HOMEPAGE]) == 6
    # Six governed themes share one placement-wide live slot.
    assert len(public_categories[BannerPlacement.HOMEPAGE_AD]) == 6
    assert len(public_categories[BannerPlacement.FINANCIAL_SERVICES]) == 16
    assert len(public_categories[BannerPlacement.PROPERTIES]) == 16
    assert expected_business_line(BannerPlacement.FINANCIAL_SERVICES) == "loans"
    assert expected_business_line(BannerPlacement.PROPERTIES) == "real_estate"


def test_every_placement_is_declared_in_both_lookup_tables() -> None:
    """Both dicts are indexed with [], so a missing entry is a 500, not a None.

    CATEGORIES_BY_PLACEMENT backs category_label(); the limit table backs the
    anonymous public banners query.
    """
    assert set(CATEGORIES_BY_PLACEMENT) == set(BannerPlacement)
    assert set(PUBLIC_BANNERS_LIMIT_BY_PLACEMENT) == set(BannerPlacement) - {
        BannerPlacement.DASHBOARD
    }
    # The strip serves one sponsor; every other public carousel serves seven.
    assert PUBLIC_BANNERS_LIMIT_BY_PLACEMENT[BannerPlacement.HOMEPAGE_AD] == 1


def test_homepage_ad_is_cross_line_and_cannot_promote_a_property() -> None:
    """Both behaviours come from fall-through branches, so pin them.

    A sponsor strip serves both business lines, and it is a paid slot rather
    than a listing promo -- linking a property to one must stay impossible.
    """
    assert expected_business_line(BannerPlacement.HOMEPAGE_AD) is None
    for key in CATEGORIES_BY_PLACEMENT[BannerPlacement.HOMEPAGE_AD]:
        assert not property_category_matches_campaign(
            BannerPlacement.HOMEPAGE_AD, key, PropertyCategory.VILLAS, PropertySubtype.VILLA
        )


def test_homepage_ad_slots_avoid_the_magic_offers_category_key() -> None:
    """services/banners.py couples the literal "offers" to a required Offer link.

    A sponsor slot named "offers" would force every banner in it to reference a
    live Offer, which is not what the strip is for.
    """
    assert "offers" not in CATEGORIES_BY_PLACEMENT[BannerPlacement.HOMEPAGE_AD]


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
