import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type CampaignMediaAsset = Schemas["CampaignMediaRead"];

export async function listCampaignMedia(params?: {
  activeOnly?: boolean;
  usageType?: string;
  businessLine?: string;
}): Promise<ApiResponse<CampaignMediaAsset[]>> {
  const query = new URLSearchParams();
  if (params?.activeOnly) query.set("active_only", "true");
  if (params?.usageType) query.set("usage_type", params.usageType);
  if (params?.businessLine) query.set("business_line", params.businessLine);
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await apiRequest<Schemas["CampaignMediaListResponse"]>(
    `/api/v1/campaign-media${suffix}`,
  );
  if (!response.ok) return response;
  return { ok: true, status: response.status, data: response.data.assets };
}

export async function getCampaignMediaUploadUrl(
  payload: Schemas["CampaignMediaUploadRequest"],
): Promise<ApiResponse<Schemas["CampaignMediaUploadResponse"]>> {
  return apiRequest(`/api/v1/campaign-media/image-upload-url`, {
    method: "POST",
    body: payload,
  });
}

export async function createCampaignMedia(
  payload: Schemas["CampaignMediaCreate"],
): Promise<ApiResponse<CampaignMediaAsset>> {
  return apiRequest(`/api/v1/campaign-media`, { method: "POST", body: payload });
}

export async function updateCampaignMedia(
  id: string,
  payload: Schemas["CampaignMediaUpdate"],
): Promise<ApiResponse<CampaignMediaAsset>> {
  return apiRequest(`/api/v1/campaign-media/${id}`, { method: "PATCH", body: payload });
}

export async function deleteCampaignMedia(id: string): Promise<ApiResponse<undefined>> {
  return apiRequest(`/api/v1/campaign-media/${id}`, { method: "DELETE" });
}
