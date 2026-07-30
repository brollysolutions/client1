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

export type Bank = Schemas["BankRead"];

// loanTypeId filters to banks that offer that loan type (FR-6.3 per-bank
// availability) -- omitted, every active bank is returned unfiltered.
export async function getBanks(loanTypeId?: string): Promise<ApiResponse<Bank[]>> {
  const qs = loanTypeId ? `?loan_type_id=${loanTypeId}` : "";
  const res = await apiRequest<Schemas["BankListResponse"]>(`/api/v1/loans/banks${qs}`);
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.banks };
}

export type LoanOfficerContact = {
  name: string;
  staffCode: string;
};

// Null is the "no officer assigned yet" state, not an error -- a client with
// no loan application yet, or one whose telecaller hasn't been assigned, has
// no officer to show. Contact routes through the support-ticket flow
// (lib/support-tickets.ts); this endpoint never returns phone/email.
export async function getMyLoanOfficer(): Promise<ApiResponse<LoanOfficerContact | null>> {
  const res = await apiRequest<Schemas["LoanOfficerContactRead"] | null>("/api/v1/loans/officer");
  if (!res.ok) return res;
  if (res.data === null) return { ok: true, status: res.status, data: null };
  return {
    ok: true,
    status: res.status,
    data: { name: res.data.name, staffCode: res.data.staff_code },
  };
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
