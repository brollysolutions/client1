// Loan applications client for the authenticated client dashboard.
//
// Calls GET /api/v1/loans/applications through the typed fetch wrapper in
// lib/api/client.ts. Wire shapes come from the generated contract
// (packages/contracts/generated/schema.d.ts); this module maps them to the
// camelCase shape the UI consumes, same pattern as getMe() in lib/auth.ts.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type LoanStatus = Schemas["LoanStatus"];
export type FeeOutcome = Schemas["FeeOutcome"];

export type LoanApplication = {
  id: string;
  loanTypeLabel: string;
  status: LoanStatus;
  statusReason: string | null;
  amountRequested: string | null;
  amountSanctioned: string | null;
  interestRate: string | null;
  processingFee: string | null;
  feeOutcome: FeeOutcome | null;
  openedOn: string; // ISO date
  closedOn: string | null;
};

function mapApplication(raw: Schemas["LoanApplicationRead"]): LoanApplication {
  return {
    id: raw.id,
    loanTypeLabel: raw.loan_type.label,
    status: raw.status,
    statusReason: raw.status_reason,
    amountRequested: raw.amount_requested,
    amountSanctioned: raw.amount_sanctioned,
    interestRate: raw.interest_rate,
    processingFee: raw.processing_fee,
    feeOutcome: raw.fee_outcome,
    openedOn: raw.opened_at,
    closedOn: raw.closed_at,
  };
}

export async function getLoanApplications(): Promise<ApiResponse<LoanApplication[]>> {
  const res = await apiRequest<Schemas["LoanApplicationListResponse"]>("/api/v1/loans/applications");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.applications.map(mapApplication) };
}

export async function getLoanApplication(id: string): Promise<ApiResponse<LoanApplication>> {
  const res = await apiRequest<Schemas["LoanApplicationRead"]>(
    `/api/v1/loans/applications/${id}`,
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapApplication(res.data) };
}

export type LoanTypeOption = {
  id: string;
  label: string;
};

export async function getLoanTypes(): Promise<ApiResponse<LoanTypeOption[]>> {
  const res = await apiRequest<Schemas["LoanTypeListResponse"]>("/api/v1/loans/loan-types");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.loan_types };
}

export async function createLoanApplication(input: {
  loanTypeId: string;
  amountRequested: string;
}): Promise<ApiResponse<LoanApplication>> {
  const res = await apiRequest<Schemas["LoanApplicationRead"]>("/api/v1/loans/applications", {
    method: "POST",
    body: {
      loan_type_id: input.loanTypeId,
      amount_requested: input.amountRequested,
    } satisfies Schemas["LoanApplicationCreate"],
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapApplication(res.data) };
}
