// Property-submissions client for the Admin/Sub-Admin review queue.
//
// Thin typed wrapper over /api/v1/property-submissions via lib/api/client.ts.
// The wire shape (snake_case, generated) is surfaced as-is here; the review UI
// reads price_paise and formats it for display (the catalog's price_display is
// only authored at approval, so a pending submission has none).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";
import { uploadFileToPresignedPost } from "@/lib/agent-application";

type Schemas = components["schemas"];
export type Submission = Schemas["SubmissionRead"];
export type SubmissionStatus = Submission["status"];
export type SubmissionMediaInput = Schemas["SubmissionMediaInput"];

export async function presignPropertyMedia(
  file: File,
  kind: SubmissionMediaInput["kind"],
): Promise<ApiResponse<Schemas["PropertyMediaUploadResponse"]>> {
  return apiRequest<Schemas["PropertyMediaUploadResponse"]>(
    "/api/v1/property-submissions/media-upload-url",
    {
      method: "POST",
      body: { kind, content_type: file.type },
    },
  );
}

export async function uploadPropertyMedia(
  images: File[],
  documents: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: true; media: SubmissionMediaInput[] } | { ok: false; error: string }> {
  const files = [
    ...images.map((file) => ({ file, kind: "image" as const })),
    ...documents.map((file) => ({ file, kind: "document" as const })),
  ];
  const media: SubmissionMediaInput[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const { file, kind } = files[index];
    const presign = await presignPropertyMedia(file, kind);
    if (!presign.ok) return { ok: false, error: presign.error || "Could not prepare an upload." };
    if (file.size > presign.data.max_bytes) {
      return { ok: false, error: `${file.name} exceeds the upload limit.` };
    }
    const uploaded = await uploadFileToPresignedPost(
      presign.data.upload_url,
      presign.data.fields,
      file,
    );
    if (!uploaded.ok) return { ok: false, error: `Could not upload ${file.name}.` };
    media.push({
      kind,
      content_type: file.type as SubmissionMediaInput["content_type"],
      object_key: presign.data.object_key,
      position: index,
    });
    onProgress?.(index + 1, files.length);
  }
  return { ok: true, media };
}

export async function submitProperty(
  payload: Schemas["SubmissionCreate"],
): Promise<ApiResponse<Submission>> {
  return apiRequest<Submission>(`/api/v1/property-submissions`, {
    method: "POST",
    body: payload,
  });
}

export async function listSubmissions(
  status?: SubmissionStatus,
): Promise<ApiResponse<Submission[]>> {
  const qs = status ? `?status=${status}` : "";
  const res = await apiRequest<Schemas["SubmissionListResponse"]>(
    `/api/v1/property-submissions${qs}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.submissions };
}

export async function approveSubmission(id: string): Promise<ApiResponse<Submission>> {
  return apiRequest<Submission>(`/api/v1/property-submissions/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectSubmission(
  id: string,
  note: string,
): Promise<ApiResponse<Submission>> {
  return apiRequest<Submission>(`/api/v1/property-submissions/${id}/reject`, {
    method: "POST",
    body: { note },
  });
}

export async function accessSubmissionMedia(
  submissionId: string,
  mediaId: string,
): Promise<ApiResponse<Schemas["SubmissionMediaAccessResponse"]>> {
  return apiRequest<Schemas["SubmissionMediaAccessResponse"]>(
    `/api/v1/property-submissions/${submissionId}/media/${mediaId}/access`,
  );
}
