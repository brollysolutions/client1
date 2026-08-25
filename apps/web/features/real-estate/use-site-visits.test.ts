import { describe, expect, it } from "vitest";

import { nextUpcomingVisit } from "@/features/real-estate/use-site-visits";
import type { SiteVisit } from "@/lib/site-visits";

function visit(overrides: Partial<SiteVisit>): SiteVisit {
  return {
    id: "visit-id",
    propertyRef: "property-id",
    title: "Baner Heights",
    locality: "Baner",
    city: "Pune",
    contactName: "Asha",
    contactMobile: "+919876543210",
    preferredDate: "2026-08-20",
    preferredTimeSlot: "morning",
    message: null,
    status: "requested",
    cancelledAt: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    vehicleArrangement: null,
    ...overrides,
  };
}

describe("nextUpcomingVisit()", () => {
  it("returns undefined for an empty list", () => {
    expect(nextUpcomingVisit([])).toBeUndefined();
  });

  it("picks the soonest requested or confirmed visit", () => {
    const later = visit({ id: "later", preferredDate: "2026-09-10" });
    const soonest = visit({ id: "soonest", preferredDate: "2026-08-15", status: "confirmed" });
    const middle = visit({ id: "middle", preferredDate: "2026-08-25" });

    expect(nextUpcomingVisit([later, soonest, middle])?.id).toBe("soonest");
  });

  it("ignores done and cancelled visits even if their date is soonest", () => {
    const done = visit({ id: "done", preferredDate: "2026-08-05", status: "done" });
    const cancelled = visit({ id: "cancelled", preferredDate: "2026-08-06", status: "cancelled" });
    const upcoming = visit({ id: "upcoming", preferredDate: "2026-08-20", status: "requested" });

    expect(nextUpcomingVisit([done, cancelled, upcoming])?.id).toBe("upcoming");
  });

  it("returns undefined when every visit is done or cancelled", () => {
    const done = visit({ id: "done", status: "done" });
    const cancelled = visit({ id: "cancelled", status: "cancelled" });

    expect(nextUpcomingVisit([done, cancelled])).toBeUndefined();
  });
});
