// Admin loan-config client -- loan types, banks, per-bank availability
// (FR-6.3/FR-6.4). Thin typed wrapper over /api/v1/admin/* via
// lib/api/client.ts, mirroring lib/offers-api.ts's shape.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type AdminLoanType = Schemas["AdminLoanTypeRead"];
export type ProductCategory = Schemas["ProductCategory"];
export type ProductFormDefinition = Schemas["ProductFormDefinition"];
export type FormFieldDefinition = Schemas["FormFieldDefinition"];
export type FormInputType = Schemas["FormInputType"];
export type AdminBank = Schemas["AdminBankRead"];
export type AdminProviderOffer = Schemas["AdminProviderOfferRead"];
export type ProviderType = Schemas["ProviderType"];
export type AvailabilityEntry = Schemas["BankAvailabilityEntry"];
export type AvailabilityMatrix = Schemas["BankAvailabilityMatrixResponse"];

export async function listAdminLoanTypes(): Promise<ApiResponse<AdminLoanType[]>> {
  const res = await apiRequest<Schemas["AdminLoanTypeListResponse"]>("/api/v1/admin/loan-types");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.loan_types };
}

export async function createLoanType(
  payload: Schemas["LoanTypeCreate"],
): Promise<ApiResponse<AdminLoanType>> {
  return apiRequest<AdminLoanType>("/api/v1/admin/loan-types", { method: "POST", body: payload });
}

export async function updateLoanType(
  id: string,
  payload: Schemas["LoanTypeUpdate"],
): Promise<ApiResponse<AdminLoanType>> {
  return apiRequest<AdminLoanType>(`/api/v1/admin/loan-types/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function listAdminBanks(): Promise<ApiResponse<AdminBank[]>> {
  const res = await apiRequest<Schemas["AdminBankListResponse"]>("/api/v1/admin/banks");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.banks };
}

export async function createBank(
  payload: Schemas["BankCreate"],
): Promise<ApiResponse<AdminBank>> {
  return apiRequest<AdminBank>("/api/v1/admin/banks", { method: "POST", body: payload });
}

export async function updateBank(
  id: string,
  payload: Schemas["BankUpdate"],
): Promise<ApiResponse<AdminBank>> {
  return apiRequest<AdminBank>(`/api/v1/admin/banks/${id}`, { method: "PATCH", body: payload });
}

export async function deleteBank(id: string): Promise<ApiResponse<null>> {
  return apiRequest<null>(`/api/v1/admin/banks/${id}`, { method: "DELETE" });
}

export async function listProviderOffers(): Promise<ApiResponse<AdminProviderOffer[]>> {
  const res = await apiRequest<Schemas["AdminProviderOfferListResponse"]>(
    "/api/v1/admin/product-provider-offers",
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.offers };
}

export async function createProviderOffer(
  payload: Schemas["ProviderOfferCreate"],
): Promise<ApiResponse<AdminProviderOffer>> {
  return apiRequest<AdminProviderOffer>("/api/v1/admin/product-provider-offers", {
    method: "POST",
    body: payload,
  });
}

export async function updateProviderOffer(
  id: string,
  payload: Schemas["ProviderOfferUpdate"],
): Promise<ApiResponse<AdminProviderOffer>> {
  return apiRequest<AdminProviderOffer>(`/api/v1/admin/product-provider-offers/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

const PROVIDER_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadProviderLogo(
  bankId: string,
  file: File,
  sourceReference: string,
): Promise<ApiResponse<AdminBank>> {
  if (!PROVIDER_LOGO_TYPES.has(file.type)) {
    return { ok: false, status: 422, error: "Choose a JPEG, PNG, or WebP logo." };
  }
  const presign = await apiRequest<Schemas["ProviderLogoUploadResponse"]>(
    "/api/v1/admin/provider-logos/upload-url",
    {
      method: "POST",
      body: { filename: file.name, content_type: file.type },
    },
  );
  if (!presign.ok) return presign;
  if (file.size < 1 || file.size > presign.data.max_bytes) {
    return { ok: false, status: 422, error: "The logo must be 1 MiB or smaller." };
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(presign.data.fields)) form.append(key, value);
  form.append("file", file);
  let uploaded: Response;
  try {
    uploaded = await fetch(presign.data.upload_url, { method: "POST", body: form });
  } catch {
    return { ok: false, status: 0, error: "Couldn't upload the logo. Please try again." };
  }
  if (!uploaded.ok) {
    return { ok: false, status: uploaded.status, error: "Storage rejected the logo upload." };
  }
  return apiRequest<AdminBank>(`/api/v1/admin/banks/${bankId}/logo`, {
    method: "POST",
    body: {
      object_key: presign.data.object_key,
      content_type: file.type,
      source_reference: sourceReference,
    },
  });
}

export async function getBankAvailabilityMatrix(): Promise<ApiResponse<AvailabilityMatrix>> {
  return apiRequest<AvailabilityMatrix>("/api/v1/admin/bank-availability");
}

export async function setBankAvailability(
  bankId: string,
  payload: Schemas["BankAvailabilitySet"],
): Promise<ApiResponse<AvailabilityMatrix>> {
  return apiRequest<AvailabilityMatrix>(`/api/v1/admin/banks/${bankId}/availability`, {
    method: "PUT",
    body: payload,
  });
}
