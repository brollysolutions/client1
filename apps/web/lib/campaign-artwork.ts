import type { components } from "@contracts/generated/schema";

type Schemas = components["schemas"];
type Placement = Schemas["BannerPlacement"];
export type ArtworkUsageType = Schemas["CampaignMediaCreate"]["usage_type"];

/**
 * Mirror of `apps/api/app/campaign_artwork.py`.
 *
 * Each usage type names one rendered surface with one target geometry, so the
 * Media Library can group artwork by where it belongs and every thumbnail can
 * be shown at the shape it will actually render in. Before the split, a 9:5
 * homepage hero and a 16:9 sponsor card were both `public_banner` and both
 * force-cropped to 2:1 in the grid, which made them indistinguishable.
 *
 * The API is the authority: it re-validates geometry on upload and re-checks
 * the usage type against the placement on save. These values drive presentation
 * and pre-submit guidance only.
 */
export type ArtworkSurface = {
  usageType: ArtworkUsageType;
  label: string;
  /** What a Sub Admin is choosing artwork *for*, in their words. */
  description: string;
  width: number;
  height: number;
  /** Tailwind aspect class for thumbnails and preview slots. */
  aspectClass: string;
  /** Composition guidance shown next to the upload control. */
  composition: string;
};

export const ARTWORK_SURFACES: Record<ArtworkUsageType, ArtworkSurface> = {
  homepage_banner: {
    usageType: "homepage_banner",
    label: "Homepage hero",
    description: "Full-bleed carousel at the top of the Home page",
    width: 1440,
    height: 800,
    aspectClass: "aspect-[9/5]",
    composition: "Keep the subject on the right with clear copy space on the left.",
  },
  sponsor: {
    usageType: "sponsor",
    label: "Homepage sponsor",
    description: "Sponsor strip above the Home page hero",
    width: 960,
    height: 540,
    aspectClass: "aspect-video",
    composition: "Use a text-free scene with the subject centred for the left media panel.",
  },
  section_banner: {
    usageType: "section_banner",
    label: "Section banner",
    description: "Carousel below the header on Financial Services and Properties",
    width: 1440,
    height: 576,
    aspectClass: "aspect-[5/2]",
    composition:
      "Keep calm copy space on the left, let the scene enter the middle, and hold the focal subject on the right.",
  },
  dashboard_banner: {
    usageType: "dashboard_banner",
    label: "Dashboard banner",
    description: "Card on the signed-in Client and Agent dashboards",
    width: 1440,
    height: 800,
    aspectClass: "aspect-[9/5]",
    composition: "Keep important details away from the outer edges; copy overlays from the left.",
  },
  dashboard_offer: {
    usageType: "dashboard_offer",
    label: "Dashboard offer",
    description: "Coupon card on the signed-in dashboards",
    width: 1120,
    height: 490,
    aspectClass: "aspect-[16/7]",
    composition: "Show the benefit itself; the partner name and code are rendered as text.",
  },
  campaign: {
    usageType: "campaign",
    label: "Multi-use campaign",
    description: "Usable on any surface whose shape it fits",
    width: 1440,
    height: 720,
    aspectClass: "aspect-[2/1]",
    composition: "Leave generous margins so the same image survives several crops.",
  },
};

/** Rendering order for the library and the picker: public surfaces first. */
export const ARTWORK_SURFACE_ORDER: readonly ArtworkUsageType[] = [
  "homepage_banner",
  "sponsor",
  "section_banner",
  "dashboard_banner",
  "dashboard_offer",
  "campaign",
];

/**
 * Artwork accepted at each placement. `campaign` is always allowed; the
 * surface-specific bucket is not interchangeable.
 */
export const BANNER_USAGE_TYPES_BY_PLACEMENT: Record<Placement, ArtworkUsageType[]> = {
  homepage: ["homepage_banner", "campaign"],
  homepage_ad: ["sponsor", "campaign"],
  financial_services: ["section_banner", "campaign"],
  properties: ["section_banner", "campaign"],
  dashboard: ["dashboard_banner", "campaign"],
};

export const OFFER_USAGE_TYPES: ArtworkUsageType[] = ["dashboard_offer", "campaign"];

/** The bucket a new upload should default to for a given placement. */
export function primaryUsageType(placement: Placement): ArtworkUsageType {
  return BANNER_USAGE_TYPES_BY_PLACEMENT[placement][0];
}

/**
 * Legacy `public_banner` rows predate the homepage/section split and are still
 * readable from the API, so presentation has to place them somewhere.
 */
export function surfaceFor(usageType: string): ArtworkSurface {
  return (
    ARTWORK_SURFACES[usageType as ArtworkUsageType] ?? {
      ...ARTWORK_SURFACES.campaign,
      label: "Public banner (legacy)",
      description: "Artwork registered before homepage and section banners were separated",
    }
  );
}

const RATIO_TOLERANCE = 0.08;

/**
 * Whether an asset's own pixels match the surface it is being offered for.
 * Multi-use artwork is the common case here: it passes the loose band on
 * upload, so it can still be the wrong shape for a specific surface.
 */
export function fitsSurface(
  asset: { width?: number | null; height?: number | null },
  surface: ArtworkSurface,
): boolean {
  if (!asset.width || !asset.height) return true;
  const ratio = asset.width / asset.height;
  return Math.abs(ratio - surface.width / surface.height) <= RATIO_TOLERANCE;
}

export function formatTargetSize(surface: ArtworkSurface): string {
  return `${surface.width} × ${surface.height}`;
}
