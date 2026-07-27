import { afterEach, describe, expect, it, vi } from "vitest";

import type { components } from "@contracts/generated/schema";

import { getPublicListings, mapPublicListing } from "@/lib/public-properties";

type Schemas = components["schemas"];

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function wireListing(overrides: Partial<Schemas["PublicPropertyRead"]> = {}): Schemas["PublicPropertyRead"] {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "2 BHK Apartment",
    type: "Apartment",
    location: "Baner, Pune",
    price_display: "₹78 L",
    meta: "2 bed · 1,120 sqft",
    image: "/illustrations/properties/apartment-1.svg",
    category: "apartments",
    rera_number: "RERA/KA/2024/1234",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapPublicListing()", () => {
  it("maps every wire field to the display shape", () => {
    const listing = mapPublicListing(wireListing());
    expect(listing).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "2 BHK Apartment",
      location: "Baner, Pune",
      price: "₹78 L",
      type: "Apartment",
      category: "apartments",
      meta: "2 bed · 1,120 sqft",
      image: "/illustrations/properties/apartment-1.svg",
      reraNumber: "RERA/KA/2024/1234",
    });
  });

  it("converts a null meta to undefined", () => {
    const listing = mapPublicListing(wireListing({ meta: null }));
    expect(listing.meta).toBeUndefined();
  });

  it("converts a null image to undefined", () => {
    const listing = mapPublicListing(wireListing({ image: null }));
    expect(listing.image).toBeUndefined();
  });

  it("keeps a repo-local image path", () => {
    const listing = mapPublicListing(wireListing({ image: "/illustrations/properties/plot-1.svg" }));
    expect(listing.image).toBe("/illustrations/properties/plot-1.svg");
  });

  it("drops an absolute image URL to protect next/image (no configured remote hosts)", () => {
    const listing = mapPublicListing(
      wireListing({ image: "https://cdn.example.com/listing.jpg" }),
    );
    expect(listing.image).toBeUndefined();
  });
});

describe("getPublicListings()", () => {
  it("maps a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(200, { properties: [wireListing()] })),
    );

    const listings = await getPublicListings();
    expect(listings).toHaveLength(1);
    expect(listings[0].id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns an empty array on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(500, { detail: "boom" })),
    );

    expect(await getPublicListings()).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    expect(await getPublicListings()).toEqual([]);
  });

  it("returns an empty array on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }) as unknown as Response));

    expect(await getPublicListings()).toEqual([]);
  });
});
