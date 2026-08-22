import { afterEach, describe, expect, it, vi } from "vitest";

import { createSiteVisit, getSiteVisits } from "@/lib/site-visits";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("site visits vehicle arrangement mapping", () => {
  it("sends pickup opt-in fields using the generated wire shape", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(201, {
        id: "visit-1",
        property_ref: "prop-1",
        title: "Home",
        locality: "Whitefield",
        city: "Bengaluru",
        contact_name: "Asha",
        contact_mobile: "+919876543210",
        preferred_date: "2026-08-09",
        preferred_time_slot: "morning",
        message: null,
        status: "requested",
        cancelled_at: null,
        created_at: "2026-08-07T00:00:00Z",
        updated_at: "2026-08-07T00:00:00Z",
        vehicle_arrangement: null,
      }),
    );

    await createSiteVisit({
      propertyRef: "prop-1",
      contactName: "Asha",
      contactMobile: "+919876543210",
      preferredDate: "2026-08-09",
      preferredTimeSlot: "morning",
      pickupRequested: true,
      pickupLocation: "MG Road",
      pickupAt: "2026-08-09T04:30:00Z",
    });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      property_ref: "prop-1",
      pickup_requested: true,
      pickup_location: "MG Road",
      pickup_at: "2026-08-09T04:30:00Z",
    });
    expect(body).not.toHaveProperty("title");
    expect(body).not.toHaveProperty("locality");
    expect(body).not.toHaveProperty("city");
  });

  it("maps nested arrangement details for the client view", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        visits: [
          {
            id: "visit-1",
            property_ref: "prop-1",
            title: "Home",
            locality: "Whitefield",
            city: "Bengaluru",
            contact_name: "Asha",
            contact_mobile: "+919876543210",
            preferred_date: "2026-08-09",
            preferred_time_slot: "morning",
            message: null,
            status: "requested",
            cancelled_at: null,
            created_at: "2026-08-07T00:00:00Z",
            updated_at: "2026-08-07T00:00:00Z",
            vehicle_arrangement: {
              id: "arrangement-1",
              pickup_location: "MG Road",
              pickup_at: "2026-08-09T04:30:00Z",
              status: "assigned",
              vehicle_make_model: "Toyota Innova",
              vehicle_registration: "KA01AB1234",
              driver_name: "Ravi",
              driver_mobile: "+919876543210",
              completed_at: null,
              cancelled_at: null,
              cancellation_reason: null,
              created_at: "2026-08-07T00:00:00Z",
              updated_at: "2026-08-07T00:00:00Z",
            },
          },
        ],
      }),
    );

    const result = await getSiteVisits();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].vehicleArrangement).toMatchObject({
        status: "assigned",
        driverName: "Ravi",
        vehicleRegistration: "KA01AB1234",
      });
    }
  });
});
