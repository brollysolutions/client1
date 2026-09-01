import type { components } from "@contracts/generated/schema";

import { uploadFileToPresignedPost } from "@/lib/agent-application";
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

/**
 * One asset with its full `usages` list.
 *
 * The list endpoint returns `usage_count` but an empty `usages` array -- it
 * would otherwise run three queries per asset. Fetch this when a detail view
 * needs to show what actually depends on an image.
 */
export async function getCampaignMedia(id: string): Promise<ApiResponse<CampaignMediaAsset>> {
  return apiRequest(`/api/v1/campaign-media/${id}`);
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

export const CAMPAIGN_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const CAMPAIGN_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Presign, upload, then register one artwork file.
 *
 * The three calls have to happen in this order and the staging key from the
 * first is the only key the create endpoint accepts, so both the Media Library
 * and the in-form picker share this rather than each re-deriving the sequence.
 */
export async function uploadCampaignArtwork(input: {
  file: File;
  title: string;
  altText: string;
  usageType: Schemas["CampaignMediaCreate"]["usage_type"];
  businessLine: Schemas["CampaignMediaCreate"]["business_line"];
  tags?: string[];
  sourceReference?: string | null;
}): Promise<ApiResponse<CampaignMediaAsset>> {
  const contentType = input.file.type as Schemas["CampaignMediaUploadRequest"]["content_type"];
  const presign = await getCampaignMediaUploadUrl({
    content_type: contentType,
    filename: input.file.name,
  });
  if (!presign.ok) return presign;

  const uploaded = await uploadFileToPresignedPost(
    presign.data.upload_url,
    presign.data.fields,
    input.file,
  );
  if (!uploaded.ok) {
    return { ok: false, status: 0, error: "Artwork upload failed. Check your connection and retry." };
  }

  return createCampaignMedia({
    business_line: input.businessLine,
    usage_type: input.usageType,
    title: input.title,
    alt_text: input.altText,
    tags: input.tags ?? [],
    object_key: presign.data.object_key,
    content_type: contentType as Schemas["CampaignMediaCreate"]["content_type"],
    source_reference: input.sourceReference ?? null,
  });
}
