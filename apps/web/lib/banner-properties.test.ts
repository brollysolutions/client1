import { describe, expect, it } from "vitest";

import {
  isPropertyCampaignTemplate,
  isLegacyPropertyCampaignTemplate,
  propertyCampaignHref,
  propertyCampaignImage,
  propertyMatchesCampaign,
} from "@/lib/banner-properties";

const activeVilla = {
  active: true,
  category: "villas" as const,
  property_subtype: "villa" as const,
};

describe("property-backed banner helpers", () => {
  it("allows any active property for the homepage Properties category", () => {
    const template = { placement: "homepage" as const, category_key: "properties" };
    expect(isPropertyCampaignTemplate(template)).toBe(true);
    expect(propertyMatchesCampaign(activeVilla, template)).toBe(true);
  });

  it("requires an exact property category on the Properties placement", () => {
    expect(
      propertyMatchesCampaign(activeVilla, {
        placement: "properties",
        category_key: "villas",
      }),
    ).toBe(true);
    expect(
      propertyMatchesCampaign(activeVilla, {
        placement: "properties",
        category_key: "apartments",
      }),
    ).toBe(false);
  });

  it("marks only the five broad property templates as legacy choices", () => {
    expect(
      isLegacyPropertyCampaignTemplate({ placement: "properties", category_key: "villas" }),
    ).toBe(true);
    expect(
      isLegacyPropertyCampaignTemplate({ placement: "properties", category_key: "villa" }),
    ).toBe(false);
  });

  it("rejects inactive properties and non-property templates", () => {
    expect(
      propertyMatchesCampaign(
        { active: false, category: "villas", property_subtype: "villa" },
        { placement: "properties", category_key: "villas" },
      ),
    ).toBe(false);
    expect(
      isPropertyCampaignTemplate({ placement: "homepage", category_key: "loans" }),
    ).toBe(false);
  });

  it("requires an exact subtype for the new property artwork", () => {
    expect(
      propertyMatchesCampaign(activeVilla, {
        placement: "properties",
        category_key: "villa",
      }),
    ).toBe(true);
    expect(
      propertyMatchesCampaign(activeVilla, {
        placement: "properties",
        category_key: "gated-community-apartment",
      }),
    ).toBe(false);
  });

  it("uses only managed media and builds a same-site enquiry URL", () => {
    expect(propertyCampaignImage({ media_urls: ["https://assets.example/villa.jpg"] })).toBe(
      "https://assets.example/villa.jpg",
    );
    expect(propertyCampaignImage({ media_urls: [] })).toBeUndefined();
    expect(
      propertyCampaignImage(
        { media_urls: ["https://assets.example/villa.jpg"] },
        { placement: "properties", image_url: "/banner-templates/properties/villa.webp" },
      ),
    ).toBe("/banner-templates/properties/villa.webp");
    expect(propertyCampaignHref({ title: "Lake Villa", location: "Kokapet" })).toBe(
      "/contact?line=real_estate&product=Lake+Villa%2C+Kokapet",
    );
  });
});
