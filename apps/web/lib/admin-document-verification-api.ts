// Admin unified document-verification client — subjects (grouped by lead,
// mixing employee-collected task_documents and client-uploaded
// loan_documents) + per-subject document list + verify/unverify.
// Thin typed wrapper over /api/v1/admin/document-verification, same pattern
// as lib/admin-fee-cashbacks-api.ts. Wire shape (snake_case, generated) is
// surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type DocumentSubject = Schemas["DocumentSubjectRead"];
export type VerifiableDocument = Schemas["VerifiableDocumentRead"];
export type DocumentSource = Schemas["DocumentSubjectRead"]["source"];
export type DocumentVerifyRequest = Schemas["DocumentVerifyRequest"];

export const DOCUMENT_SUBJECT_PAGE_LIMIT = 25;

export type DocumentSubjectPage = { subjects: DocumentSubject[]; total: number };

export type DocumentSubjectQuery = {
  onlyUnverified: boolean;
  /** Server-side line scope; the route has always accepted it. */
  businessLine?: "loans" | "real_estate";
  offset?: number;
};

/**
 * `total` is returned so the console can paginate. The route has always sent
 * both it and an `offset`; this wrapper used to drop the count on the floor and
 * request a flat 50 rows with no way to reach row 51.
 */
export async function listDocumentSubjects(
  query: DocumentSubjectQuery,
): Promise<ApiResponse<DocumentSubjectPage>> {
  const params = new URLSearchParams({
    only_unverified: String(query.onlyUnverified),
    limit: String(DOCUMENT_SUBJECT_PAGE_LIMIT),
    offset: String(query.offset ?? 0),
  });
  if (query.businessLine) params.set("business_line", query.businessLine);
  const res = await apiRequest<Schemas["DocumentSubjectListResponse"]>(
    `/api/v1/admin/document-verification/subjects?${params}`,
  );
  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: { subjects: res.data.subjects, total: res.data.total },
  };
}

export async function listVerifiableDocuments(
  source: DocumentSource,
  subjectUuid: string,
): Promise<ApiResponse<VerifiableDocument[]>> {
  const params = new URLSearchParams({ source, subject_uuid: subjectUuid });
  const res = await apiRequest<Schemas["VerifiableDocumentListResponse"]>(
    `/api/v1/admin/document-verification/documents?${params}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.documents };
}

export async function verifyDocument(
  source: DocumentSource,
  documentId: string,
  body: DocumentVerifyRequest,
): Promise<ApiResponse<VerifiableDocument>> {
  return apiRequest<VerifiableDocument>(
    `/api/v1/admin/document-verification/documents/${documentId}?source=${source}`,
    { method: "PATCH", body },
  );
}
