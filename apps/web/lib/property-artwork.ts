import type { components } from "@contracts/generated/schema";

type Schemas = components["schemas"];
export type PropertyArtworkCategory = Schemas["PropertyCategory"];
export type PropertyArtworkSubtype = Schemas["PropertySubtype"];

const ARTWORK_ROOT = "/illustrations/property-fallbacks";

// Local, generated display artwork. These are deliberately separate from
// managed property media: they are never uploaded, persisted, or counted as a
// listing photo. The `satisfies` guard makes a future contract subtype addition
// fail at compile time until it gets an intentional visual treatment.
export const PROPERTY_SUBTYPE_ARTWORK = {
  individual_house: `${ARTWORK_ROOT}/individual-house.png`,
  standalone_apartment: `${ARTWORK_ROOT}/standalone-apartment.png`,
  gated_community_apartment: `${ARTWORK_ROOT}/gated-community-apartment.png`,
  villa: `${ARTWORK_ROOT}/villa.png`,
  locked_space: `${ARTWORK_ROOT}/locked-space.png`,
  unlocked_space: `${ARTWORK_ROOT}/unlocked-space.png`,
  plot: `${ARTWORK_ROOT}/plot.png`,
  farmland: `${ARTWORK_ROOT}/farmland.png`,
  agriland: `${ARTWORK_ROOT}/agriland.png`,
} as const satisfies Record<PropertyArtworkSubtype, string>;

export const CATEGORY_ARTWORK_SUBTYPE = {
  houses: "individual_house",
  apartments: "gated_community_apartment",
  villas: "villa",
  plots: "plot",
  commercial: "unlocked_space",
} as const satisfies Record<PropertyArtworkCategory, PropertyArtworkSubtype>;

export function categoryArtwork(category: PropertyArtworkCategory) {
  return PROPERTY_SUBTYPE_ARTWORK[CATEGORY_ARTWORK_SUBTYPE[category]];
}

export function resolvePropertyArtwork({
  image,
  propertySubtype,
  category,
}: {
  image?: string;
  propertySubtype?: PropertyArtworkSubtype;
  category: PropertyArtworkCategory;
}) {
  if (image) return { src: image, isFallback: false } as const;
  return {
    src: propertySubtype ? PROPERTY_SUBTYPE_ARTWORK[propertySubtype] : categoryArtwork(category),
    isFallback: true,
  } as const;
}

export function isReraVerified(status: Schemas["ReraVerificationStatus"] | null | undefined) {
  return status === "verified";
}
