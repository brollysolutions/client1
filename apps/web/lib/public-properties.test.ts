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
    property_subtype: "standalone_apartment",
    rera_number: "RERA/KA/2024/1234",
    rera_verification_status: "verified",
    structured_details: null,
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
      propertySubtype: "standalone_apartment",
      meta: "2 bed · 1,120 sqft",
      image: "/illustrations/properties/apartment-1.svg",
      reraNumber: "RERA/KA/2024/1234",
      reraVerificationStatus: "verified",
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

  it("drops an absolute legacy image URL outside the configured asset host", () => {
    const listing = mapPublicListing(
      wireListing({ image: "https://cdn.example.com/listing.jpg" }),
    );
    expect(listing.image).toBeUndefined();
  });

  it("prefers managed media from the configured storage host", () => {
    const listing = mapPublicListing(
      wireListing({
        image: "/illustrations/properties/plot-1.svg",
        media_urls: ["http://localhost:9000/task-documents/public/properties/1/image.jpg"],
      }),
    );
    expect(listing.image).toBe(
      "http://localhost:9000/task-documents/public/properties/1/image.jpg",
    );
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
