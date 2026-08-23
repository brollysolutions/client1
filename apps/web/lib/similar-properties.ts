// Pure, dependency-free ranking for the property detail page's "Similar
// properties" panel. Deliberately imports no types from lib/properties.ts
// (public PropertyListing) or lib/real-estate.ts (dashboard REListing) — both
// of those modules already have a direction (real-estate.ts imports from
// properties.ts), and this needs to serve callers on both sides without
// creating a cycle or leaning either module toward the other's shape. Every
// field on SimilarityFacets is optional, so both PropertyListing and REListing
// already satisfy it structurally with zero adapters and zero casts.

export type SimilarityFacets = {
  id: string;
  category: string;
  propertySubtype?: string | null;
  /** Pre-joined "Locality, City" display string, e.g. "Baner, Pune". */
  location?: string;
  locality?: string;
  city?: string;
  /** Pre-formatted display price, "₹78 L" / "₹1.2 Cr". */
  price?: string;
  priceLakhs?: number;
  areaSqft?: number;
  bhk?: number;
};

export type SimilarMatch<T> = {
  listing: T;
  score: number;
  /** Short "why this" label for the card, or null when nothing rose above
   * the price-proximity fallback. */
  reason: string | null;
};

export const SIMILAR_LIMIT = 4;
// A candidate must at minimum share the category to appear at all (the
// "same subtype" weight is 50, "same category" is 30 — this floor sits right
// at the category-only score). This is the guarantee that a plot never
// appears as a "similar property" under an apartment listing.
export const MIN_SIMILARITY_SCORE = 30;

const SCORE = {
  subtype: 50,
  category: 30,
  locality: 25,
  city: 15,
  priceMax: 20,
  areaMax: 10,
  bhk: 5,
};

/**
 * Parses the server-generated display price back into lakhs. Safe only
 * because price_display is derived, not free text: format_inr_display() in
 * apps/api/app/services/property_submissions.py emits exactly "₹<n> L" or
 * "₹<n> Cr" (trailing zeros trimmed, no thousands grouping). If that format
 * ever changes, the parser test for this function is the thing that should
 * fail first.
 */
export function parseDisplayPriceLakhs(price?: string): number | undefined {
  if (!price) return undefined;
  const match = /^₹\s*([\d.]+)\s*(L|Cr)$/.exec(price.trim());
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return match[2] === "Cr" ? value * 100 : value;
}

type Normalized = {
  locality?: string;
  city?: string;
  priceLakhs?: number;
};

function normalize(facets: SimilarityFacets): Normalized {
  const parts = facets.location?.includes(",")
    ? facets.location.split(",").map((part) => part.trim())
    : undefined;
  const locality = (facets.locality ?? parts?.[0])?.toLowerCase();
  const city = (facets.city ?? (parts && parts.length > 1 ? parts[parts.length - 1] : undefined))?.toLowerCase();
  const priceLakhs = facets.priceLakhs ?? parseDisplayPriceLakhs(facets.price);
  return { locality, city, priceLakhs };
}

function proximityScore(a: number, b: number, max: number): number {
  const denom = Math.max(a, b);
  if (denom <= 0) return 0;
  return Math.round(max * Math.max(0, 1 - Math.abs(a - b) / denom));
}

function score(
  subject: SimilarityFacets,
  subjectNorm: Normalized,
  candidate: SimilarityFacets,
  candidateNorm: Normalized,
): number {
  let total = 0;
  if (subject.propertySubtype && candidate.propertySubtype && subject.propertySubtype === candidate.propertySubtype) {
    total += SCORE.subtype;
  }
  if (subject.category === candidate.category) {
    total += SCORE.category;
  }
  if (subjectNorm.locality && candidateNorm.locality && subjectNorm.locality === candidateNorm.locality) {
    total += SCORE.locality;
  }
  if (subjectNorm.city && candidateNorm.city && subjectNorm.city === candidateNorm.city) {
    total += SCORE.city;
  }
  if (subjectNorm.priceLakhs != null && candidateNorm.priceLakhs != null) {
    total += proximityScore(subjectNorm.priceLakhs, candidateNorm.priceLakhs, SCORE.priceMax);
  }
  if ((subject.areaSqft ?? 0) > 0 && (candidate.areaSqft ?? 0) > 0) {
    total += proximityScore(subject.areaSqft!, candidate.areaSqft!, SCORE.areaMax);
  }
  if ((subject.bhk ?? 0) > 0 && subject.bhk === candidate.bhk) {
    total += SCORE.bhk;
  }
  return total;
}

function reasonFor(
  subject: SimilarityFacets,
  subjectNorm: Normalized,
  candidate: SimilarityFacets,
  candidateNorm: Normalized,
): string | null {
  if (subjectNorm.locality && candidateNorm.locality && subjectNorm.locality === candidateNorm.locality) {
    return "Same locality";
  }
  if (subjectNorm.city && candidateNorm.city && subjectNorm.city === candidateNorm.city) {
    return `Also in ${candidate.city ?? candidateNorm.city}`;
  }
  if (subject.propertySubtype && candidate.propertySubtype && subject.propertySubtype === candidate.propertySubtype) {
    return "Similar property type";
  }
  if (subjectNorm.priceLakhs != null && candidateNorm.priceLakhs != null) {
    const denom = Math.max(subjectNorm.priceLakhs, candidateNorm.priceLakhs);
    if (denom > 0 && Math.abs(subjectNorm.priceLakhs - candidateNorm.priceLakhs) / denom <= 0.15) {
      return "Similar budget";
    }
  }
  return null;
}

export function rankSimilarProperties<T extends SimilarityFacets>(
  subject: SimilarityFacets,
  candidates: readonly T[],
  options?: { limit?: number },
): SimilarMatch<T>[] {
  const limit = options?.limit ?? SIMILAR_LIMIT;
  const subjectNorm = normalize(subject);

  const scored = candidates
    .map((candidate, index) => {
      if (candidate.id === subject.id) return null;
      const candidateNorm = normalize(candidate);
      const points = score(subject, subjectNorm, candidate, candidateNorm);
      if (points < MIN_SIMILARITY_SCORE) return null;
      const priceGap =
        subjectNorm.priceLakhs != null && candidateNorm.priceLakhs != null
          ? Math.abs(subjectNorm.priceLakhs - candidateNorm.priceLakhs) / Math.max(subjectNorm.priceLakhs, candidateNorm.priceLakhs, 1)
          : Number.POSITIVE_INFINITY;
      return {
        listing: candidate,
        score: points,
        reason: reasonFor(subject, subjectNorm, candidate, candidateNorm),
        priceGap,
        index,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.priceGap !== b.priceGap) return a.priceGap - b.priceGap;
    return a.index - b.index;
  });

  return scored.slice(0, limit).map(({ listing, score: points, reason }) => ({ listing, score: points, reason }));
}
