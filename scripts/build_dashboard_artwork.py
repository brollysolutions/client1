#!/usr/bin/env python
"""Recompose dashboard-banner and dashboard-offer artwork from licensed sources.

The Campaign Media Library shipped with artwork for the four public placements
only. Dashboard banners and dashboard offers had none, so a Sub Admin opening
either picker saw an almost-empty grid and no sense of what each surface wants.

This script derives that missing artwork from the campaign WebPs already
licensed and committed under `apps/web/public/banner-templates/`. Every output
is a crop of one source followed by a downscale -- never an upscale -- so the
result stays as sharp as the material it came from.

Output is deterministic: fixed crop geometry, fixed encoder settings, no
metadata. Re-running reproduces byte-identical files, which is what lets
`apps/web/lib/banner-template-assets.test.ts` pin them by hash.

Usage (from the repository root):
    uv run --project apps/api python scripts/build_dashboard_artwork.py
    uv run --project apps/api python scripts/build_dashboard_artwork.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = REPO_ROOT / "apps" / "web" / "public" / "banner-templates"

# 9:5, matching the homepage hero and the dashboard banner card. Sized so every
# source yields it by cropping and downscaling alone.
DASHBOARD_BANNER_SIZE = (1296, 720)
# 16:7, matching DashboardOfferCard's `aspect-[16/7]` image well.
DASHBOARD_OFFER_SIZE = (1120, 490)

WEBP_QUALITY = 82
WEBP_METHOD = 6


@dataclass(frozen=True)
class Artwork:
    """One generated asset: where it comes from and what it depicts."""

    key: str
    source: str
    title: str
    alt_text: str
    business_line: str
    tags: tuple[str, ...]


DASHBOARD_BANNERS: tuple[Artwork, ...] = (
    Artwork(
        key="loan-progress",
        source="homepage/loans.webp",
        title="Loan progress",
        alt_text="A borrower reviewing the progress of a loan application",
        business_line="loans",
        tags=("loans", "progress", "application"),
    ),
    Artwork(
        key="document-upload",
        source="homepage/core-concepts.webp",
        title="Document upload",
        alt_text="Paperwork being prepared for a lending application",
        business_line="both",
        tags=("documents", "upload", "verification"),
    ),
    Artwork(
        key="referral-boost",
        source="homepage/referrals.webp",
        title="Referral boost",
        alt_text="Two people sharing a referral recommendation",
        business_line="both",
        tags=("referral", "rewards", "sharing"),
    ),
    Artwork(
        key="profile-complete",
        source="homepage/general.webp",
        title="Complete your profile",
        alt_text="A customer completing an account profile",
        business_line="both",
        tags=("profile", "onboarding", "account"),
    ),
    Artwork(
        key="property-saved",
        source="homepage/properties.webp",
        title="Saved property",
        alt_text="A contemporary residence saved to a shortlist",
        business_line="real_estate",
        tags=("property", "shortlist", "saved"),
    ),
    Artwork(
        key="agent-payout",
        source="starter/rewards-and-savings.webp",
        title="Agent payout",
        alt_text="Earnings and rewards prepared for payout",
        business_line="both",
        tags=("agent", "payout", "commission"),
    ),
)

DASHBOARD_OFFERS: tuple[Artwork, ...] = (
    Artwork(
        key="cashback",
        source="financial_services/credit-cards.webp",
        title="Cashback offer",
        alt_text="A payment card presented for a cashback benefit",
        business_line="both",
        tags=("cashback", "card", "reward"),
    ),
    Artwork(
        key="festive",
        source="properties/offers.webp",
        title="Festive offer",
        alt_text="A festive seasonal promotion scene",
        business_line="both",
        tags=("festive", "seasonal", "promotion"),
    ),
    Artwork(
        key="fee-waiver",
        source="financial_services/personal-loan.webp",
        title="Fee waiver",
        alt_text="A borrower reviewing waived processing charges",
        business_line="loans",
        tags=("fee", "waiver", "processing"),
    ),
    Artwork(
        key="partner-deal",
        source="financial_services/business-loan.webp",
        title="Partner deal",
        alt_text="Two business partners agreeing a joint offer",
        business_line="both",
        tags=("partner", "deal", "business"),
    ),
    Artwork(
        key="interest-cut",
        source="financial_services/home-loan.webp",
        title="Reduced interest rate",
        alt_text="A home loan customer reviewing a reduced rate",
        business_line="loans",
        tags=("interest", "rate", "home loan"),
    ),
    Artwork(
        key="travel",
        source="financial_services/travel-insurance.webp",
        title="Travel offer",
        alt_text="A traveller preparing for a covered journey",
        business_line="both",
        tags=("travel", "journey", "insurance"),
    ),
    Artwork(
        key="shopping",
        source="homepage/offers.webp",
        title="Shopping offer",
        alt_text="A shopper redeeming a retail benefit",
        business_line="both",
        tags=("shopping", "retail", "benefit"),
    ),
    Artwork(
        key="insurance",
        source="financial_services/health-insurance.webp",
        title="Insurance offer",
        alt_text="A family reviewing health cover together",
        business_line="both",
        tags=("insurance", "health", "cover"),
    ),
)

GROUPS: tuple[tuple[str, tuple[int, int], tuple[Artwork, ...]], ...] = (
    ("dashboard", DASHBOARD_BANNER_SIZE, DASHBOARD_BANNERS),
    ("dashboard_offer", DASHBOARD_OFFER_SIZE, DASHBOARD_OFFERS),
)


def _centre_crop(image: Image.Image, ratio: float) -> Image.Image:
    """Largest centred crop of `image` at `ratio`.

    Cropping from the centre keeps the right-hand subject and left-hand copy
    space that the governed artwork is composed around, only tightening the
    frame at both edges.
    """
    width, height = image.size
    if width / height > ratio:
        crop_width = round(height * ratio)
        left = (width - crop_width) // 2
        return image.crop((left, 0, left + crop_width, height))
    crop_height = round(width / ratio)
    top = (height - crop_height) // 2
    return image.crop((0, top, width, top + crop_height))


def _render(source_path: Path, size: tuple[int, int]) -> bytes:
    target_width, target_height = size
    with Image.open(source_path) as source:
        image = source.convert("RGB")
        cropped = _centre_crop(image, target_width / target_height)
        if cropped.width < target_width:
            raise SystemExit(
                f"{source_path.relative_to(REPO_ROOT)} is too small: a "
                f"{target_width}x{target_height} crop would need upscaling from "
                f"{cropped.width}x{cropped.height}."
            )
        resized = cropped.resize(size, Image.LANCZOS)
        buffer = BytesIO()
        resized.save(
            buffer,
            format="WEBP",
            quality=WEBP_QUALITY,
            method=WEBP_METHOD,
            exif=b"",
            icc_profile=None,
        )
        return buffer.getvalue()


def build(check_only: bool) -> int:
    stale: list[str] = []
    rows: list[tuple[str, Artwork, int, tuple[int, int]]] = []
    for directory, size, artworks in GROUPS:
        out_dir = TEMPLATES / directory
        if not check_only:
            out_dir.mkdir(parents=True, exist_ok=True)
        for artwork in artworks:
            source_path = TEMPLATES / artwork.source
            if not source_path.exists():
                raise SystemExit(f"missing source artwork: {artwork.source}")
            payload = _render(source_path, size)
            destination = out_dir / f"{artwork.key}.webp"
            existing = destination.read_bytes() if destination.exists() else None
            if existing != payload:
                if check_only:
                    stale.append(str(destination.relative_to(REPO_ROOT)))
                else:
                    destination.write_bytes(payload)
            rows.append((directory, artwork, len(payload), size))

    if check_only and stale:
        print("Regenerate dashboard artwork; these files are stale or missing:")
        for item in stale:
            print(f"  {item}")
        return 1

    for directory, artwork, byte_size, size in rows:
        digest = hashlib.sha256(
            (TEMPLATES / directory / f"{artwork.key}.webp").read_bytes()
        ).hexdigest()[:12]
        print(
            f"{directory}/{artwork.key}.webp  {size[0]}x{size[1]}  "
            f"{byte_size:>7} bytes  {digest}"
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail instead of writing when generated artwork is stale.",
    )
    args = parser.parse_args()
    return build(args.check)


if __name__ == "__main__":
    sys.exit(main())
