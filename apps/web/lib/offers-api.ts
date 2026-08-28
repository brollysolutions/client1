// Offers client for Sub Admin authoring and the Admin approval queue.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type Offer = Schemas["OfferRead"];
export type OfferStatus = Offer["status"];

export async function createOffer(payload: Schemas["OfferCreate"]): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers`, {
    method: "POST",
    body: payload,
  });
}

export async function updateOffer(
  id: string,
  payload: Schemas["OfferUpdate"],
): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function listOffers(status?: OfferStatus): Promise<ApiResponse<Offer[]>> {
  const qs = status ? `?status_filter=${status}` : "";
  const res = await apiRequest<Schemas["OfferListResponse"]>(`/api/v1/offers${qs}`);
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.offers };
}

export async function scheduleOffer(id: string): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers/${id}/schedule`, {
    method: "POST",
  });
}

export async function getOfferImageUploadUrl(
  payload: Schemas["OfferImageUploadRequest"],
): Promise<ApiResponse<Schemas["OfferImageUploadResponse"]>> {
  return apiRequest<Schemas["OfferImageUploadResponse"]>(`/api/v1/offers/image-upload-url`, {
    method: "POST",
    body: payload,
  });
}

export async function submitOffer(id: string): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers/${id}/submit`, { method: "POST" });
}

export async function approveOffer(id: string): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers/${id}/approve`, { method: "POST" });
}

export async function rejectOffer(id: string, note: string): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers/${id}/reject`, {
    method: "POST",
    body: { note },
  });
}

export async function activateOffer(id: string): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers/${id}/activate`, {
    method: "POST",
  });
}

export async function archiveOffer(id: string): Promise<ApiResponse<Offer>> {
  return apiRequest<Offer>(`/api/v1/offers/${id}/archive`, {
    method: "POST",
  });
}
