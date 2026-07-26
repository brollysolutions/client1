// Public agent-application intake — wired to POST /api/v1/agent-applications/*
// (apps/api/app/api/v1/agent_applications.py). The mobile is proven via OTP
// before anything is written: initiate -> verify -> ticket, then the ticket
// gates both the 4 KYC upload presigns and the final submit. Orchestration
// mirrors the employee task-document flow (lib/employee-api.ts): presign ->
// direct-to-storage upload -> confirm, repeated per document, then one submit.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";
import type { LeadBusinessLine } from "@/lib/leads";
import { toE164 } from "@/lib/phone";

type Schemas = components["schemas"];

export type AgentOtpResponse = Schemas["AgentApplyOtpInitiateResponse"];
export type AgentApplyTicket = Schemas["AgentApplyTicketResponse"];
export type AgentDocType = Schemas["AgentApplyUploadPresignRequest"]["doc_type"];
export type AgentDocContentType = Schemas["AgentApplyUploadPresignRequest"]["content_type"];

const ALLOWED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export async function initiateAgentApplyOtp(
  mobile: string,
  // Honeypot: hidden on the real form, so any value = automation.
  company?: string,
): Promise<ApiResponse<AgentOtpResponse>> {
  return apiRequest<AgentOtpResponse>("/api/v1/agent-applications/otp/initiate", {
    method: "POST",
    body: { mobile: toE164(mobile), ...(company ? { company } : {}) },
  });
}

export async function resendAgentApplyOtp(mobile: string): Promise<ApiResponse<AgentOtpResponse>> {
  return apiRequest<AgentOtpResponse>("/api/v1/agent-applications/otp/resend", {
    method: "POST",
    body: { mobile: toE164(mobile) },
  });
}

export async function verifyAgentApplyOtp(
  mobile: string,
  otp: string,
): Promise<ApiResponse<AgentApplyTicket>> {
  return apiRequest<AgentApplyTicket>("/api/v1/agent-applications/otp/verify", {
    method: "POST",
    body: { mobile: toE164(mobile), otp },
  });
}

export async function presignAgentApplicationDocument(
  ticket: string,
  docType: AgentDocType,
  contentType: AgentDocContentType,
): Promise<ApiResponse<Schemas["AgentApplyUploadPresignResponse"]>> {
  return apiRequest<Schemas["AgentApplyUploadPresignResponse"]>(
    "/api/v1/agent-applications/uploads/presign",
    {
      method: "POST",
      body: { application_ticket: ticket, doc_type: docType, content_type: contentType },
    },
  );
}

// Direct-to-storage multipart POST against the presigned URL — a different
// host than the API's BASE_URL, so this deliberately bypasses apiRequest (no
// auth header, no JSON body, no auto-refresh retry; storage doesn't know
// about any of that), same reasoning as uploadFileToPresignedUrl in
// lib/employee-api.ts. The file part MUST be appended LAST — S3/MinIO ignore
// any field that comes after it.
export async function uploadFileToPresignedPost(
  uploadUrl: string,
  fields: Record<string, string>,
  file: File,
): Promise<{ ok: boolean }> {
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    form.append("file", file);
    const res = await fetch(uploadUrl, { method: "POST", body: form });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export type AgentApplicationInput = {
  // Minted by verifyAgentApplyOtp; the mobile itself never travels in the
  // submit body, it comes from the ticket only.
  ticket: string;
  firstName: string;
  lastName: string;
  email: string;
  businessLine: LeadBusinessLine;
  rera?: string;
  // Aadhaar is captured as two sides; PAN is front-only (the back carries no
  // identity data). Address proof was dropped by product decision (2026-07-12).
  aadhaarFront: File;
  aadhaarBack: File;
  pan: File;
  photo: File;
  // Honeypot: hidden on the real form, so any value = automation.
  company?: string;
};

export type AgentApplicationResult = { ok: true } | { ok: false; error: string };

const DOC_FIELDS: { key: "aadhaarFront" | "aadhaarBack" | "pan" | "photo"; docType: AgentDocType }[] = [
  { key: "aadhaarFront", docType: "aadhaar_front" },
  { key: "aadhaarBack", docType: "aadhaar_back" },
  { key: "pan", docType: "pan" },
  { key: "photo", docType: "photo" },
];

export async function submitAgentApplication(
  input: AgentApplicationInput,
  onProgress?: (done: number, total: number) => void,
): Promise<AgentApplicationResult> {
  // Validate every file's type up front, before any presign — a file rejected
  // on the 4th slot must not have already burned a presign+upload on the
  // first 3 (wasted network calls, wasted presign quota).
  for (const { key } of DOC_FIELDS) {
    if (!ALLOWED_CONTENT_TYPES.has(input[key].type)) {
      return { ok: false, error: "One of your files isn't a supported type. Please try again." };
    }
  }

  const objectKeys: Partial<Record<AgentDocType, string>> = {};

  for (const { key, docType } of DOC_FIELDS) {
    const file = input[key];
    const presignRes = await presignAgentApplicationDocument(
      input.ticket,
      docType,
      file.type as AgentDocContentType,
    );
    if (!presignRes.ok) return { ok: false, error: presignRes.error };

    const uploadRes = await uploadFileToPresignedPost(
      presignRes.data.upload_url,
      presignRes.data.fields,
      file,
    );
    if (!uploadRes.ok) {
      return { ok: false, error: "Upload to storage failed. Please try again." };
    }

    objectKeys[docType] = presignRes.data.object_key;
    onProgress?.(DOC_FIELDS.findIndex((d) => d.docType === docType) + 1, DOC_FIELDS.length);
  }

  const res = await apiRequest<Schemas["AgentApplicationSubmitResponse"]>(
    "/api/v1/agent-applications",
    {
      method: "POST",
      body: {
        application_ticket: input.ticket,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        business_line: input.businessLine,
        rera_code: input.rera,
        aadhaar_front_key: objectKeys.aadhaar_front,
        aadhaar_back_key: objectKeys.aadhaar_back,
        pan_key: objectKeys.pan,
        photo_key: objectKeys.photo,
        ...(input.company ? { company: input.company } : {}),
      },
    },
  );

  if (res.ok) return { ok: true };
  return { ok: false, error: res.error };
}
