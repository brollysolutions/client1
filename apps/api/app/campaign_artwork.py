"""Closed vocabulary tying campaign artwork geometry to the surface that renders it.

`campaign_media_assets.usage_type` used to describe artwork only coarsely: every
public placement shared one `public_banner` bucket even though the homepage hero
is 9:5 and the two section carousels are 5:2. A 1200x480 image therefore passed
validation for the homepage and then rendered wrong, and the Media Library had no
way to show a Sub Admin which surface an asset actually belonged to.

Each usage type now names one surface with one target geometry. Validation checks
the aspect ratio against that target within a small tolerance rather than against
a single band wide enough to admit every surface. `campaign` remains the
deliberately loose multi-use bucket and keeps the original wide band.

`public_banner` is retained as a legacy value so rows written before the split
stay readable; nothing writes it any more (see `template_usage_type`).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.banner import BannerPlacement

# Ratio slack either side of a surface's target. Wide enough to accept a
# reasonable hand-crop, narrow enough that 9:5 (1.80) and 5:2 (2.50) artwork can
# never be mistaken for one another.
RATIO_TOLERANCE = 0.08


@dataclass(frozen=True)
class ArtworkSpec:
    """Target geometry for one campaign surface."""

    usage_type: str
    label: str
    target_width: int
    target_height: int
    min_width: int
    min_height: int
    # Set for the deliberately loose multi-use bucket, which has no single
    # target surface and so is checked against a band instead of a target.
    ratio_band: tuple[float, float] | None = None

    @property
    def target_ratio(self) -> float:
        return self.target_width / self.target_height

    def accepts(self, width: int, height: int) -> bool:
        if width < self.min_width or height < self.min_height:
            return False
        ratio = width / height
        if self.ratio_band is not None:
            low, high = self.ratio_band
            return low <= ratio <= high
        return abs(ratio - self.target_ratio) <= RATIO_TOLERANCE


HOMEPAGE_BANNER = "homepage_banner"
SECTION_BANNER = "section_banner"
SPONSOR = "sponsor"
DASHBOARD_BANNER = "dashboard_banner"
DASHBOARD_OFFER = "dashboard_offer"
CAMPAIGN = "campaign"
LEGACY_PUBLIC_BANNER = "public_banner"

ARTWORK_SPECS: dict[str, ArtworkSpec] = {
    HOMEPAGE_BANNER: ArtworkSpec(
        usage_type=HOMEPAGE_BANNER,
        label="Homepage hero",
        target_width=1440,
        target_height=800,
        min_width=1200,
        min_height=667,
    ),
    SPONSOR: ArtworkSpec(
        usage_type=SPONSOR,
        label="Homepage sponsor",
        target_width=960,
        target_height=540,
        min_width=800,
        min_height=450,
    ),
    SECTION_BANNER: ArtworkSpec(
        usage_type=SECTION_BANNER,
        label="Section banner",
        target_width=1440,
        target_height=576,
        min_width=1200,
        min_height=480,
    ),
    DASHBOARD_BANNER: ArtworkSpec(
        usage_type=DASHBOARD_BANNER,
        label="Dashboard banner",
        target_width=1440,
        target_height=800,
        min_width=1000,
        min_height=556,
    ),
    DASHBOARD_OFFER: ArtworkSpec(
        usage_type=DASHBOARD_OFFER,
        label="Dashboard offer",
        target_width=1120,
        target_height=490,
        min_width=800,
        min_height=350,
    ),
    CAMPAIGN: ArtworkSpec(
        usage_type=CAMPAIGN,
        label="Multi-use campaign",
        target_width=1440,
        target_height=720,
        min_width=800,
        min_height=360,
        ratio_band=(1.45, 2.75),
    ),
    LEGACY_PUBLIC_BANNER: ArtworkSpec(
        usage_type=LEGACY_PUBLIC_BANNER,
        label="Public banner (legacy)",
        target_width=1440,
        target_height=576,
        min_width=1200,
        min_height=480,
        ratio_band=(1.45, 2.75),
    ),
}

# Artwork a Sub Admin may attach directly to a banner at each placement. The
# multi-use bucket is always allowed; the surface-specific bucket is not
# interchangeable, so homepage artwork can never land in a 5:2 section carousel.
BANNER_USAGE_TYPES_BY_PLACEMENT: dict[BannerPlacement, set[str]] = {
    BannerPlacement.HOMEPAGE: {HOMEPAGE_BANNER, CAMPAIGN},
    BannerPlacement.HOMEPAGE_AD: {SPONSOR, CAMPAIGN},
    BannerPlacement.FINANCIAL_SERVICES: {SECTION_BANNER, CAMPAIGN},
    BannerPlacement.PROPERTIES: {SECTION_BANNER, CAMPAIGN},
    BannerPlacement.DASHBOARD: {DASHBOARD_BANNER, CAMPAIGN},
}

if set(BANNER_USAGE_TYPES_BY_PLACEMENT) != set(BannerPlacement):  # pragma: no cover
    missing = sorted(p.value for p in set(BannerPlacement) - set(BANNER_USAGE_TYPES_BY_PLACEMENT))
    raise RuntimeError(f"BANNER_USAGE_TYPES_BY_PLACEMENT is missing placement(s): {missing}")

OFFER_USAGE_TYPES: set[str] = {DASHBOARD_OFFER, CAMPAIGN}


def template_usage_type(placement: BannerPlacement) -> str:
    """Usage type stamped on the asset generated for a governed template version."""
    if placement == BannerPlacement.HOMEPAGE_AD:
        return SPONSOR
    if placement == BannerPlacement.HOMEPAGE:
        return HOMEPAGE_BANNER
    if placement == BannerPlacement.DASHBOARD:
        return DASHBOARD_BANNER
    return SECTION_BANNER


def spec_for(usage_type: str) -> ArtworkSpec | None:
    return ARTWORK_SPECS.get(usage_type)
