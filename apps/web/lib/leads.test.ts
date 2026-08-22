import { describe, expect, it } from "vitest";

import { contactHref } from "@/lib/leads";

describe("contactHref", () => {
  it("carries a canonical property reference without putting PII in the URL", () => {
    const href = contactHref({
      line: "real_estate",
      product: "Lake View Villa, Baner",
      propertyRef: "123e4567-e89b-42d3-a456-426614174000",
    });
    const url = new URL(href, "https://dhanadhara.invalid");
    expect(url.pathname).toBe("/contact");
    expect(url.searchParams.get("line")).toBe("real_estate");
    expect(url.searchParams.get("product")).toBe("Lake View Villa, Baner");
    expect(url.searchParams.get("property")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("caps product context at the public lead contract limit", () => {
    const url = new URL(
      contactHref({ line: "real_estate", product: "x".repeat(160) }),
      "https://dhanadhara.invalid",
    );
    expect(url.searchParams.get("product")).toHaveLength(120);
  });
});
