// Site visits client for the authenticated real-estate client dashboard.
//
// Calls /api/v1/site-visits/* through the typed fetch wrapper in
// lib/api/client.ts. Wire shapes come from the generated contract; this maps
// them to the camelCase shape the UI consumes (same pattern as lib/support-tickets.ts).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type SiteVisitStatus = Schemas["SiteVisitStatus"];
export type SiteVisitTimeSlot = Schemas["SiteVisitTimeSlot"];
export type VehicleArrangementStatus = Schemas["VehicleArrangementStatus"];

export type VehicleArrangement = {
  id: string;
  pickupLocation: string;
  pickupAt: string;
  status: VehicleArrangementStatus;
  vehicleMakeModel: string | null;
  vehicleRegistration: string | null;
  driverName: string | null;
  driverMobile: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

export type SiteVisit = {
  id: string;
  propertyRef: string;
  title: string;
  locality: string;
  city: string;
  contactName: string;
  contactMobile: string;
  preferredDate: string; // YYYY-MM-DD
  preferredTimeSlot: SiteVisitTimeSlot;
  message: string | null;
  status: SiteVisitStatus;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  vehicleArrangement: VehicleArrangement | null;
};

function mapVisit(raw: Schemas["SiteVisitRead"]): SiteVisit {
  return {
    id: raw.id,
    propertyRef: raw.property_ref,
    title: raw.title,
    locality: raw.locality,
    city: raw.city,
    contactName: raw.contact_name,
    contactMobile: raw.contact_mobile,
    preferredDate: raw.preferred_date,
    preferredTimeSlot: raw.preferred_time_slot,
    message: raw.message,
    status: raw.status,
    cancelledAt: raw.cancelled_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    vehicleArrangement: raw.vehicle_arrangement
      ? {
          id: raw.vehicle_arrangement.id,
          pickupLocation: raw.vehicle_arrangement.pickup_location,
          pickupAt: raw.vehicle_arrangement.pickup_at,
          status: raw.vehicle_arrangement.status,
          vehicleMakeModel: raw.vehicle_arrangement.vehicle_make_model,
          vehicleRegistration: raw.vehicle_arrangement.vehicle_registration,
          driverName: raw.vehicle_arrangement.driver_name,
          driverMobile: raw.vehicle_arrangement.driver_mobile,
          completedAt: raw.vehicle_arrangement.completed_at,
          cancelledAt: raw.vehicle_arrangement.cancelled_at,
          cancellationReason: raw.vehicle_arrangement.cancellation_reason,
        }
      : null,
  };
}

export async function getSiteVisits(): Promise<ApiResponse<SiteVisit[]>> {
  const res = await apiRequest<Schemas["SiteVisitListResponse"]>("/api/v1/site-visits");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.visits.map(mapVisit) };
}

export async function createSiteVisit(input: {
  propertyRef: string;
  contactName: string;
  contactMobile: string;
  preferredDate: string;
  preferredTimeSlot: SiteVisitTimeSlot;
  message?: string;
  pickupRequested?: boolean;
  pickupLocation?: string;
  pickupAt?: string;
}): Promise<ApiResponse<SiteVisit>> {
  const res = await apiRequest<Schemas["SiteVisitRead"]>("/api/v1/site-visits", {
    method: "POST",
    body: {
      property_ref: input.propertyRef,
      contact_name: input.contactName,
      contact_mobile: input.contactMobile,
      preferred_date: input.preferredDate,
      preferred_time_slot: input.preferredTimeSlot,
      ...(input.message ? { message: input.message } : {}),
      pickup_requested: input.pickupRequested ?? false,
      ...(input.pickupRequested
        ? { pickup_location: input.pickupLocation, pickup_at: input.pickupAt }
        : {}),
    } satisfies Schemas["SiteVisitCreate"],
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapVisit(res.data) };
}

export async function cancelSiteVisit(id: string): Promise<ApiResponse<SiteVisit>> {
  const res = await apiRequest<Schemas["SiteVisitRead"]>(`/api/v1/site-visits/${id}/cancel`, {
    method: "PATCH",
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapVisit(res.data) };
}
