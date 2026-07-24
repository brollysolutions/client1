// Offers client for the Sub Admin content surface + Admin read-only oversight.
//
// Thin typed wrapper over /api/v1/offers via lib/api/client.ts. Mirrors
// lib/banners-api.ts's shape, minus approve/reject (offers has no Admin gate).

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
