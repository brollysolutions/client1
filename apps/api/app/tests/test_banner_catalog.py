from app.banner_catalog import CATEGORIES_BY_PLACEMENT, expected_business_line
from app.models.banner import BannerPlacement


def test_closed_catalog_contains_29_public_categories() -> None:
    public_categories = {
        placement: categories
        for placement, categories in CATEGORIES_BY_PLACEMENT.items()
        if placement != BannerPlacement.DASHBOARD
    }
    assert sum(len(categories) for categories in public_categories.values()) == 29
    assert len(public_categories[BannerPlacement.HOMEPAGE]) == 6
    assert len(public_categories[BannerPlacement.FINANCIAL_SERVICES]) == 16
    assert len(public_categories[BannerPlacement.PROPERTIES]) == 7
    assert expected_business_line(BannerPlacement.FINANCIAL_SERVICES) == "loans"
    assert expected_business_line(BannerPlacement.PROPERTIES) == "real_estate"
