import { describe, expect, it } from "vitest";

import { resolveSiteConfig, SITE_NAME } from "@/lib/site";

const PRODUCTION_ENV = {
  DHANADHARA_REQUIRE_PUBLIC_CONFIG: "true",
  NEXT_PUBLIC_SITE_URL: "https://launch.dhanadhara.in",
  NEXT_PUBLIC_CONTACT_PHONE: "+91 91234 56789",
  NEXT_PUBLIC_CONTACT_EMAIL: "care@dhanadhara.in",
  NEXT_PUBLIC_CONTACT_HOURS: "Monday to Saturday|10:00 AM to 7:00 PM",
  NEXT_PUBLIC_CONTACT_ADDRESS: "Dhanadhara House|Hyderabad, Telangana",
};

describe("public site identity", () => {
  it("uses the Dhanadhara product name", () => {
    expect(SITE_NAME).toBe("Dhanadhara");
  });

  it("rejects an incomplete strict production identity", () => {
    expect(() =>
      resolveSiteConfig({ DHANADHARA_REQUIRE_PUBLIC_CONFIG: "true" }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("rejects placeholder and non-HTTPS production origins", () => {
    expect(() =>
      resolveSiteConfig({
        ...PRODUCTION_ENV,
        NEXT_PUBLIC_SITE_URL: "https://www.example.com",
      }),
    ).toThrow(/placeholder/i);
    expect(() =>
      resolveSiteConfig({
        ...PRODUCTION_ENV,
        NEXT_PUBLIC_SITE_URL: "http://dhanadhara.example",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      resolveSiteConfig({
        ...PRODUCTION_ENV,
        NEXT_PUBLIC_SITE_URL: "https://launch.dhanadhara.in/marketing?draft=1",
      }),
    ).toThrow(/must be an origin/);
  });

  it("rejects sample production contact details", () => {
    expect(() =>
      resolveSiteConfig({
        ...PRODUCTION_ENV,
        NEXT_PUBLIC_CONTACT_PHONE: "+91 98765 43210",
      }),
    ).toThrow(/sample number/);
    expect(() =>
      resolveSiteConfig({
        ...PRODUCTION_ENV,
        NEXT_PUBLIC_CONTACT_ADDRESS: "1st Floor, Sample Towers|Hyderabad",
      }),
    ).toThrow(/placeholder text/);
  });

  it("normalizes verified production contact details", () => {
    expect(resolveSiteConfig(PRODUCTION_ENV)).toEqual({
      siteUrl: "https://launch.dhanadhara.in",
      contact: {
        phone: "+91 91234 56789",
        phoneHref: "tel:+919123456789",
        email: "care@dhanadhara.in",
        emailHref: "mailto:care@dhanadhara.in",
        hours: ["Monday to Saturday", "10:00 AM to 7:00 PM"],
        address: ["Dhanadhara House", "Hyderabad, Telangana"],
      },
    });
  });
});
