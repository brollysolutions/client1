import { describe, expect, it } from "vitest";

import { filterBanners, filterOffers, filterReferralRules, type QueueFilters } from "./cms-filters";

const all: QueueFilters = { search: "", status: "all", line: "all", kind: "all", from: "", to: "" };

describe("Sub Admin CMS filters", () => {
  it("combines banner text, lifecycle, line, kind, and inclusive dates", () => {
    const item = { title: "Monsoon Loans", subtitle: "Apply now", status: "live", business_line: "loans", banner_type: "action", updated_at: "2026-08-12T10:00:00Z" };
    expect(filterBanners([item as never], { ...all, search: "monsoon", status: "live", line: "loans", kind: "action", from: "2026-08-12", to: "2026-08-12" })).toHaveLength(1);
    expect(filterBanners([item as never], { ...all, line: "real_estate" })).toHaveLength(0);
  });

  it("searches offer descriptions and codes", () => {
    const item = { title: "Fee waiver", description: "Processing fee", code: "SAVE10", status: "active", business_line: "both", discount_type: "percentage", created_at: "2026-08-10T00:00:00Z", starts_at: null };
    expect(filterOffers([item as never], { ...all, search: "save10" })).toHaveLength(1);
  });

  it("searches human-visible referral rule values", () => {
    const rule = { bonus_amount: "500", rule: { trigger: "first_disbursal" }, active: true, business_line: "loans", updated_at: "2026-08-10T00:00:00Z" };
    expect(filterReferralRules([rule as never], { ...all, search: "disbursal", status: "active" })).toHaveLength(1);
  });
});
