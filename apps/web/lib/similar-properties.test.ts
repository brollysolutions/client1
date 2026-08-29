import { describe, expect, it } from "vitest";

import {
  MIN_SIMILARITY_SCORE,
  parseDisplayPriceLakhs,
  rankSimilarProperties,
  SIMILAR_LIMIT,
  type SimilarityFacets,
} from "@/lib/similar-properties";
import type { PropertyListing } from "@/lib/properties";
import type { REListing } from "@/lib/real-estate";

// Em/en dash check enforces the content rule in apps/web/CLAUDE.md: user-facing
// copy must never join clauses with — or –.
const DASH_PATTERN = /[–—]/;

const SUBJECT: SimilarityFacets = {
  id: "subject",
  category: "villas",
  propertySubtype: "villa",
  locality: "Baner",
  city: "Pune",
  priceLakhs: 120,
  areaSqft: 1800,
  bhk: 3,
};

describe("parseDisplayPriceLakhs", () => {
  it("parses lakh figures", () => {
    expect(parseDisplayPriceLakhs("₹78 L")).toBe(78);
  });
  it("parses crore figures, converting to lakhs", () => {
    expect(parseDisplayPriceLakhs("₹1.2 Cr")).toBe(120);
    expect(parseDisplayPriceLakhs("₹2 Cr")).toBe(200);
  });
  it("returns undefined for grouped rupee text and empty input", () => {
    expect(parseDisplayPriceLakhs("₹1,20,000")).toBeUndefined();
    expect(parseDisplayPriceLakhs(undefined)).toBeUndefined();
  });
});

describe("rankSimilarProperties", () => {
  it("excludes the subject by id, even against a byte-identical twin", () => {
    const twin: SimilarityFacets = { ...SUBJECT, id: "subject" };
    const results = rankSimilarProperties(SUBJECT, [twin]);
    expect(results).toHaveLength(0);
  });

  it("ranks same-subtype above same-category-only, all else equal", () => {
    const sameSubtype: SimilarityFacets = { id: "a", category: "villas", propertySubtype: "villa" };
    const sameCategoryOnly: SimilarityFacets = { id: "b", category: "villas", propertySubtype: "farmland" };
    const results = rankSimilarProperties(SUBJECT, [sameCategoryOnly, sameSubtype]);
    expect(results.map((r) => r.listing.id)).toEqual(["a", "b"]);
  });

  it("ranks same-locality above same-city-different-locality, all else equal", () => {
    const sameLocality: SimilarityFacets = { id: "a", category: "villas", locality: "Baner", city: "Pune" };
    const sameCityOnly: SimilarityFacets = { id: "b", category: "villas", locality: "Kothrud", city: "Pune" };
    const results = rankSimilarProperties(SUBJECT, [sameCityOnly, sameLocality]);
    expect(results.map((r) => r.listing.id)).toEqual(["a", "b"]);
    expect(results[0].reason).toBe("Same locality");
    expect(results[1].reason).toBe("Also in Pune");
  });

  it("gates out anything scoring below the category-only floor", () => {
    const foreignCategory: SimilarityFacets = { id: "a", category: "plots", propertySubtype: "plot" };
    const results = rankSimilarProperties(SUBJECT, [foreignCategory]);
    expect(results).toHaveLength(0);
  });

  it("respects options.limit and defaults to SIMILAR_LIMIT", () => {
    const candidates: SimilarityFacets[] = Array.from({ length: 10 }, (_, i) => ({
      id: `candidate-${i}`,
      category: "villas",
    }));
    expect(rankSimilarProperties(SUBJECT, candidates)).toHaveLength(SIMILAR_LIMIT);
    expect(rankSimilarProperties(SUBJECT, candidates, { limit: 2 })).toHaveLength(2);
  });

  it("does not falsely derive a locality from a comma-less single-token location", () => {
    const subject: SimilarityFacets = { id: "subject", category: "villas", location: "Pune" };
    const candidate: SimilarityFacets = { id: "a", category: "villas", location: "Pune" };
    const results = rankSimilarProperties(subject, [candidate]);
    // Category match alone is worth 30; if a locality had falsely been
    // derived from the bare "Pune" token, the score would be 55 (30 + 25).
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(30);
    expect(results[0].reason).not.toBe("Same locality");
  });

  it("is deterministic: repeat calls on the same input return the same id order", () => {
    const candidates: SimilarityFacets[] = [
      { id: "a", category: "villas", priceLakhs: 100 },
      { id: "b", category: "villas", priceLakhs: 140 },
      { id: "c", category: "villas", priceLakhs: 100 },
    ];
    const first = rankSimilarProperties(SUBJECT, candidates).map((r) => r.listing.id);
    const second = rankSimilarProperties(SUBJECT, candidates).map((r) => r.listing.id);
    expect(first).toEqual(second);
  });

  it("carries no em or en dash in any reason string", () => {
    const candidates: SimilarityFacets[] = [
      { id: "a", category: "villas", locality: "Baner", city: "Pune" },
      { id: "b", category: "villas", city: "Pune" },
      { id: "c", category: "villas", propertySubtype: "villa" },
      { id: "d", category: "villas", priceLakhs: 121 },
    ];
    const results = rankSimilarProperties(SUBJECT, candidates);
    for (const result of results) {
      if (result.reason) expect(result.reason).not.toMatch(DASH_PATTERN);
    }
  });

  // Structural generality: the same generic call compiles and runs against
  // both concrete listing shapes with no casts. If the generic constraint on
  // SimilarityFacets regresses to something narrower, this is a typecheck
  // failure right here, not a runtime surprise in a caller.
  it("works against the public PropertyListing shape with no casts", () => {
    const subject: PropertyListing = {
      id: "subject",
      title: "Lake View Villa",
      location: "Baner, Pune",
      price: "₹1.2 Cr",
      listingIntent: "sale",
      type: "Villa",
      category: "villas",
      propertySubtype: "villa",
    };
    const candidates: PropertyListing[] = [
      {
        id: "candidate",
        title: "Hilltop Villa",
        location: "Baner, Pune",
        price: "₹1.1 Cr",
        listingIntent: "sale",
        type: "Villa",
        category: "villas",
        propertySubtype: "villa",
      },
    ];
    const results = rankSimilarProperties(subject, candidates);
    expect(results).toHaveLength(1);
    expect(results[0].listing.title).toBe("Hilltop Villa");
  });

  it("works against the dashboard REListing shape with no casts", () => {
    const subject: Pick<
      REListing,
      "id" | "title" | "location" | "price" | "type" | "category" | "city" | "locality" | "priceLakhs" | "areaSqft" | "bhk"
    > = {
      id: "subject",
      title: "Lake View Villa",
      location: "Baner, Pune",
      price: "₹1.2 Cr",
      type: "Villa",
      category: "villas",
      city: "Pune",
      locality: "Baner",
      priceLakhs: 120,
      areaSqft: 1800,
      bhk: 3,
    };
    const candidates: (typeof subject)[] = [
      { ...subject, id: "candidate", title: "Hilltop Villa", priceLakhs: 118 },
    ];
    const results = rankSimilarProperties(subject, candidates);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThanOrEqual(MIN_SIMILARITY_SCORE);
  });
});
