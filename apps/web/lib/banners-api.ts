// Banners client for the Sub Admin content surface + Admin approval queue.
//
// Thin typed wrapper over /api/v1/banners via lib/api/client.ts. Mirrors
// lib/property-submissions-api.ts's shape.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type Banner = Schemas["BannerRead"];
export type BannerStatus = Banner["status"];

export async function createBanner(
  payload: Schemas["BannerCreate"],
): Promise<ApiResponse<Banner>> {
  return apiRequest<Banner>(`/api/v1/banners`, {
    method: "POST",
    body: payload,
  });
}

export async function updateBanner(
  id: string,
  payload: Schemas["BannerUpdate"],
): Promise<ApiResponse<Banner>> {
  return apiRequest<Banner>(`/api/v1/banners/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function listBanners(status?: BannerStatus): Promise<ApiResponse<Banner[]>> {
  const qs = status ? `?status_filter=${status}` : "";
  const res = await apiRequest<Schemas["BannerListResponse"]>(`/api/v1/banners${qs}`);
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.banners };
}

export async function submitBanner(id: string): Promise<ApiResponse<Banner>> {
  return apiRequest<Banner>(`/api/v1/banners/${id}/submit`, {
    method: "POST",
  });
}

export async function approveBanner(id: string): Promise<ApiResponse<Banner>> {
  return apiRequest<Banner>(`/api/v1/banners/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectBanner(id: string, note: string): Promise<ApiResponse<Banner>> {
  return apiRequest<Banner>(`/api/v1/banners/${id}/reject`, {
    method: "POST",
    body: { note },
  });
}

export async function getBannerImageUploadUrl(
  payload: Schemas["BannerImageUploadRequest"],
): Promise<ApiResponse<Schemas["BannerImageUploadResponse"]>> {
  return apiRequest<Schemas["BannerImageUploadResponse"]>(`/api/v1/banners/image-upload-url`, {
    method: "POST",
    body: payload,
  });
}
