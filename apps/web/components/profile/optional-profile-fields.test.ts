import { describe, expect, it } from "vitest";

import {
  EMPTY_OPTIONAL_PROFILE,
  optionalProfilePayload,
} from "@/components/profile/optional-profile-fields";
import {
  formatReverseGeocodedLocation,
  lookupReadableLocation,
  normalizeReverseGeocodeEndpoint,
} from "@/lib/reverse-geocode";

const TEST_REVERSE_GEOCODE_ENDPOINT =
  "https://api.bigdatacloud.net/data/reverse-geocode-client";

describe("optionalProfilePayload", () => {
  it("maps an empty optional profile to explicit nulls", () => {
    const result = optionalProfilePayload(EMPTY_OPTIONAL_PROFILE);
    expect(result).toEqual({
      ok: true,
      data: {
        gender: null,
        genderSelfDescription: null,
        incomeSource: null,
        incomeAmountMinor: null,
        incomePeriod: null,
        occupation: null,
        location: null,
      },
    });
  });

  it("converts rupees to integer minor units", () => {
    const result = optionalProfilePayload({
      ...EMPTY_OPTIONAL_PROFILE,
      incomeSource: "salaried",
      incomeAmountRupees: "50000.25",
      incomePeriod: "monthly",
    });
    expect(result.ok && result.data.incomeAmountMinor).toBe(5_000_025);
  });

  it("keeps a trimmed manual location", () => {
    const result = optionalProfilePayload({
      ...EMPTY_OPTIONAL_PROFILE,
      location: "  Kondapur, Hyderabad  ",
    });
    expect(result.ok && result.data.location).toBe("Kondapur, Hyderabad");
  });

  it("requires a description for self-described gender", () => {
    const result = optionalProfilePayload({
      ...EMPTY_OPTIONAL_PROFILE,
      gender: "self_described",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed and out-of-range income", () => {
    expect(
      optionalProfilePayload({
        ...EMPTY_OPTIONAL_PROFILE,
        incomeSource: "business_income",
        incomeAmountRupees: "12.345",
        incomePeriod: "annual",
      }).ok,
    ).toBe(false);
    expect(
      optionalProfilePayload({
        ...EMPTY_OPTIONAL_PROFILE,
        incomeSource: "business_income",
        incomeAmountRupees: "10000000000.01",
        incomePeriod: "annual",
      }).ok,
    ).toBe(false);
  });
});

describe("formatReverseGeocodedLocation", () => {
  it("builds a readable locality while removing duplicate and unsafe parts", () => {
    expect(
      formatReverseGeocodedLocation({
        locality: "  Kondapur\n",
        city: "Hyderabad",
        principalSubdivision: "Telangana",
        countryName: "India",
      }),
    ).toBe("Kondapur, Hyderabad, Telangana");
    expect(
      formatReverseGeocodedLocation({
        locality: "Hyderabad",
        city: "hyderabad",
        principalSubdivision: " Telangana ",
      }),
    ).toBe("Hyderabad, Telangana");
  });

  it("uses a state and country fallback but rejects a country-only response", () => {
    expect(
      formatReverseGeocodedLocation({
        principalSubdivision: "Telangana",
        countryName: "India",
      }),
    ).toBe("Telangana, India");
    expect(formatReverseGeocodedLocation({ countryName: "India" })).toBeNull();
  });
});

describe("lookupReadableLocation", () => {
  it("sends only rounded coordinates and returns the provider's bounded place name", async () => {
    let requestedUrl: URL | undefined;
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = new URL(String(input));
      return new Response(
        JSON.stringify({
          locality: "Kondapur",
          city: "Hyderabad",
          principalSubdivision: "Telangana",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await expect(
      lookupReadableLocation(17.3851, 78.4867, {
        endpoint: TEST_REVERSE_GEOCODE_ENDPOINT,
        fetcher,
        language: "en",
      }),
    ).resolves.toMatchObject({
      label: "Kondapur, Hyderabad, Telangana",
      locality: "Kondapur",
      city: "Hyderabad",
      subdivision: "Telangana",
    });

    if (!requestedUrl) {
      throw new Error("Expected the reverse-geocode request to run");
    }
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://api.bigdatacloud.net/data/reverse-geocode-client",
    );
    expect(requestedUrl.searchParams.get("latitude")).toBe("17.39");
    expect(requestedUrl.searchParams.get("longitude")).toBe("78.49");
    expect(requestedUrl.searchParams.get("localityLanguage")).toBe("en");
  });

  it("rejects provider and malformed-response failures without returning coordinates", async () => {
    const providerFailure: typeof fetch = async () => new Response(null, { status: 503 });
    const malformedResponse: typeof fetch = async () =>
      new Response(JSON.stringify({ countryName: "India" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    await expect(
      lookupReadableLocation(17.3851, 78.4867, {
        endpoint: TEST_REVERSE_GEOCODE_ENDPOINT,
        fetcher: providerFailure,
      }),
    ).rejects.toThrow("Readable location lookup failed");
    await expect(
      lookupReadableLocation(17.3851, 78.4867, {
        endpoint: TEST_REVERSE_GEOCODE_ENDPOINT,
        fetcher: malformedResponse,
      }),
    ).rejects.toThrow("Readable location was not found");
  });
});

describe("normalizeReverseGeocodeEndpoint", () => {
  it("accepts only an HTTPS endpoint without credentials, query, or fragment", () => {
    expect(normalizeReverseGeocodeEndpoint(TEST_REVERSE_GEOCODE_ENDPOINT)).toBe(
      TEST_REVERSE_GEOCODE_ENDPOINT,
    );
    expect(normalizeReverseGeocodeEndpoint("http://example.com/reverse")).toBeNull();
    expect(normalizeReverseGeocodeEndpoint("https://user:pass@example.com/reverse")).toBeNull();
    expect(normalizeReverseGeocodeEndpoint("https://example.com/reverse?token=public")).toBeNull();
  });
});
