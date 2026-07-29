// Client KYC-document client — presign/confirm/list/delete against
// /api/v1/loans/applications/{id}/documents (+ the cross-application
// /api/v1/loans/documents). Thin typed wrapper over lib/api/client.ts, same
// pattern as lib/employee-api.ts. Wire shape (snake_case, generated) is
// surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";
import { uploadFileToPresignedPost } from "@/lib/agent-application";

type Schemas = components["schemas"];
export type LoanDocument = Schemas["LoanDocumentRead"];
export type LoanDocType = Schemas["LoanDocumentCreate"]["doc_type"];
export type LoanDocContentType = Schemas["LoanDocumentPresignRequest"]["content_type"];

export async function presignLoanDocument(
  applicationId: string,
  docType: LoanDocType,
  contentType: LoanDocContentType,
): Promise<ApiResponse<Schemas["LoanDocumentPresignResponse"]>> {
  return apiRequest<Schemas["LoanDocumentPresignResponse"]>(
    `/api/v1/loans/applications/${applicationId}/documents/presign`,
    { method: "POST", body: { doc_type: docType, content_type: contentType } },
  );
}

export async function confirmLoanDocument(
  applicationId: string,
  payload: { doc_type: LoanDocType; object_key: string; content_type: LoanDocContentType },
): Promise<ApiResponse<LoanDocument>> {
  return apiRequest<LoanDocument>(`/api/v1/loans/applications/${applicationId}/documents`, {
    method: "POST",
    body: payload,
  });
}

export async function listLoanDocumentsForApplication(
  applicationId: string,
): Promise<ApiResponse<LoanDocument[]>> {
  const res = await apiRequest<Schemas["LoanDocumentListResponse"]>(
    `/api/v1/loans/applications/${applicationId}/documents`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.documents };
}

export async function listOwnLoanDocuments(): Promise<ApiResponse<LoanDocument[]>> {
  const res = await apiRequest<Schemas["LoanDocumentListResponse"]>("/api/v1/loans/documents");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.documents };
}

export async function deleteLoanDocument(
  applicationId: string,
  documentId: string,
): Promise<ApiResponse<undefined>> {
  return apiRequest<undefined>(
    `/api/v1/loans/applications/${applicationId}/documents/${documentId}`,
    { method: "DELETE" },
  );
}

export type LoanDocumentUploadEntry = {
  docType: LoanDocType;
  file: File;
};

export type LoanDocumentUploadResult = {
  uploaded: LoanDocType[];
  failed: LoanDocType[];
};

// Sequential presign -> direct-to-storage POST -> confirm, one document at a
// time (mirrors lib/agent-application.ts::submitAgentApplication's
// orchestration). A single failed entry does NOT abort the rest — one bad
// file must not cost the other, already-succeeded uploads; the caller
// surfaces `failed` so the client can retry those specific documents from
// /dashboard/documents afterward.
export async function uploadLoanDocuments(
  applicationId: string,
  entries: LoanDocumentUploadEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<LoanDocumentUploadResult> {
  const uploaded: LoanDocType[] = [];
  const failed: LoanDocType[] = [];

  for (let i = 0; i < entries.length; i++) {
    const { docType, file } = entries[i];
    const contentType = file.type as LoanDocContentType;

    const presignRes = await presignLoanDocument(applicationId, docType, contentType);
    if (!presignRes.ok) {
      failed.push(docType);
      onProgress?.(i + 1, entries.length);
      continue;
    }

    const { object_key, upload_url, fields } = presignRes.data;
    const uploadRes = await uploadFileToPresignedPost(upload_url, fields, file);
    if (!uploadRes.ok) {
      failed.push(docType);
      onProgress?.(i + 1, entries.length);
      continue;
    }

    const confirmRes = await confirmLoanDocument(applicationId, {
      doc_type: docType,
      object_key,
      content_type: contentType,
    });
    if (confirmRes.ok) {
      uploaded.push(docType);
    } else {
      failed.push(docType);
    }
    onProgress?.(i + 1, entries.length);
  }

  return { uploaded, failed };
}
