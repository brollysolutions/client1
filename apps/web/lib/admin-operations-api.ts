import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type AdminAuthEvent = Schemas["AdminAuthEventRead"];
export type AdminEnquiry = Schemas["AdminEnquiryRead"];
export type AdminFinancialServiceEnquiry = Schemas["AdminFinancialServiceEnquiryRead"];
export type AdminFieldVisibilityConfig = Schemas["AdminFieldVisibilityConfigRead"];
export type AdminLeadActivity = Schemas["AdminLeadActivityRead"];
export type AdminLoanTransactionHistory = Schemas["AdminLoanTransactionHistoryRead"];
export type AdminSiteVisit = Schemas["AdminSiteVisitRead"];
export type AdminTransaction = Schemas["AdminTransactionRead"];

export type AdminOperationsPage = {
  limit?: number;
  offset?: number;
};

function pageQuery({ limit = 25, offset = 0 }: AdminOperationsPage = {}): string {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return query.toString();
}

export function listAdminAuthEvents(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminAuthEventListResponse"]>> {
  return apiRequest(`/api/v1/admin/operations/auth-events?${pageQuery(page)}`);
}

export function listAdminEnquiries(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminEnquiryListResponse"]>> {
  return apiRequest(`/api/v1/admin/operations/enquiries?${pageQuery(page)}`);
}

export function listAdminFinancialServiceEnquiries(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminFinancialServiceEnquiryListResponse"]>> {
  return apiRequest(
    `/api/v1/admin/operations/financial-service-enquiries?${pageQuery(page)}`,
  );
}

export function listAdminFieldVisibilityConfigs(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminFieldVisibilityConfigListResponse"]>> {
  return apiRequest(
    `/api/v1/admin/operations/field-visibility-config?${pageQuery(page)}`,
  );
}

export function listAdminLeadActivities(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminLeadActivityListResponse"]>> {
  return apiRequest(`/api/v1/admin/operations/lead-activities?${pageQuery(page)}`);
}

export function listAdminLoanTransactionHistory(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminLoanTransactionHistoryListResponse"]>> {
  return apiRequest(
    `/api/v1/admin/operations/loan-transaction-history?${pageQuery(page)}`,
  );
}

export function listAdminSiteVisits(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminSiteVisitListResponse"]>> {
  return apiRequest(`/api/v1/admin/operations/site-visits?${pageQuery(page)}`);
}

export function listAdminTransactions(
  page?: AdminOperationsPage,
): Promise<ApiResponse<Schemas["AdminTransactionListResponse"]>> {
  return apiRequest(`/api/v1/admin/operations/transactions?${pageQuery(page)}`);
}
