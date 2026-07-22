// Property-submissions client for the Admin/Sub-Admin review queue.
//
// Thin typed wrapper over /api/v1/property-submissions via lib/api/client.ts.
// The wire shape (snake_case, generated) is surfaced as-is here; the review UI
// reads price_paise and formats it for display (the catalog's price_display is
// only authored at approval, so a pending submission has none).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type Submission = Schemas["SubmissionRead"];
export type SubmissionStatus = Submission["status"];

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
