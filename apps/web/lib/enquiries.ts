// Enquiries client for the authenticated real-estate client dashboard.
//
// Calls /api/v1/enquiries through the typed fetch wrapper in lib/api/client.ts.
// Wire shapes come from the generated contract; this maps them to the
// camelCase shape the UI consumes (same pattern as lib/site-visits.ts).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type EnquiryStatus = Schemas["EnquiryStatus"];

export type Enquiry = {
  id: string;
  propertyRef: string;
  title: string;
  locality: string;
  city: string;
  contactName: string;
  contactMobile: string;
  message: string | null;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
};

function mapEnquiry(raw: Schemas["EnquiryRead"]): Enquiry {
  return {
    id: raw.id,
    propertyRef: raw.property_ref,
    title: raw.title,
    locality: raw.locality,
    city: raw.city,
    contactName: raw.contact_name,
    contactMobile: raw.contact_mobile,
    message: raw.message,
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export async function getEnquiries(): Promise<ApiResponse<Enquiry[]>> {
  const res = await apiRequest<Schemas["EnquiryListResponse"]>("/api/v1/enquiries");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.enquiries.map(mapEnquiry) };
}

export async function createEnquiry(input: {
  propertyRef: string;
  contactName: string;
  contactMobile: string;
  message?: string;
}): Promise<ApiResponse<Enquiry>> {
  const res = await apiRequest<Schemas["EnquiryRead"]>("/api/v1/enquiries", {
    method: "POST",
    body: {
      property_ref: input.propertyRef,
      contact_name: input.contactName,
      contact_mobile: input.contactMobile,
      ...(input.message ? { message: input.message } : {}),
    } satisfies Schemas["EnquiryCreate"],
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapEnquiry(res.data) };
}
