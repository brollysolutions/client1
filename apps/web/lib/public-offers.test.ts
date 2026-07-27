import { afterEach, describe, expect, it, vi } from "vitest";

import type { components } from "@contracts/generated/schema";

import { getPublicOffers, mapPublicOffer } from "@/lib/public-offers";

type Schemas = components["schemas"];

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function wireOffer(overrides: Partial<Schemas["PublicOfferRead"]> = {}): Schemas["PublicOfferRead"] {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    business_line: "loans",
    title: "Diwali Cashback Offer",
    description: "10% off processing fees",
    discount_type: "percentage",
    discount_value: "10",
    code: "DIWALI10",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapPublicOffer()", () => {
  it("maps every wire field to the display shape", () => {
    const offer = mapPublicOffer(wireOffer());
    expect(offer).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      line: "loans",
      title: "Diwali Cashback Offer",
      description: "10% off processing fees",
      discountLabel: "10% off",
      code: "DIWALI10",
    });
  });

  it("converts a null description to undefined", () => {
    const offer = mapPublicOffer(wireOffer({ description: null }));
    expect(offer.description).toBeUndefined();
  });

  it("converts a null code to undefined", () => {
    const offer = mapPublicOffer(wireOffer({ code: null }));
    expect(offer.code).toBeUndefined();
  });

  it("builds discountLabel from discount_type + discount_value", () => {
    const offer = mapPublicOffer(
      wireOffer({ discount_type: "flat", discount_value: "5000" }),
    );
    expect(offer.discountLabel).toBe("₹5,000 off");
  });

  it("leaves discountLabel undefined but keeps title/description on an unparseable value", () => {
    const offer = mapPublicOffer(wireOffer({ discount_value: "not-a-number" }));
    expect(offer.discountLabel).toBeUndefined();
    expect(offer.title).toBe("Diwali Cashback Offer");
    expect(offer.description).toBe("10% off processing fees");
  });

  it("carries the raw wire business_line through, including 'both'", () => {
    const offer = mapPublicOffer(wireOffer({ business_line: "both" }));
    expect(offer.line).toBe("both");
  });
});

describe("getPublicOffers()", () => {
  it("maps a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(200, { offers: [wireOffer()] })),
    );

    const offers = await getPublicOffers();
    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns an empty array on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(500, { detail: "boom" })),
    );

    expect(await getPublicOffers()).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    expect(await getPublicOffers()).toEqual([]);
  });

  it("returns an empty array on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }) as unknown as Response));

    expect(await getPublicOffers()).toEqual([]);
  });
});
