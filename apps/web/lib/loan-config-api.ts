// Admin loan-config client -- loan types, banks, per-bank availability
// (FR-6.3/FR-6.4). Thin typed wrapper over /api/v1/admin/* via
// lib/api/client.ts, mirroring lib/offers-api.ts's shape.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type AdminLoanType = Schemas["AdminLoanTypeRead"];
export type AdminBank = Schemas["AdminBankRead"];
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
