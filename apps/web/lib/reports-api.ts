// Admin analytics & reporting client (FR-16.1-16.3). Thin typed wrapper over
// /api/v1/admin/reports/* via lib/api/client.ts, mirroring
// lib/loan-config-api.ts's shape.

import type { components } from "@contracts/generated/schema";

import { apiDownload, apiRequest, type ApiDownloadResponse, type ApiResponse } from "@/lib/api/client";
import { buildReportParams } from "@/lib/reports";
import { brandedFilename } from "@/lib/brand";

type Schemas = components["schemas"];

export type ReportKind = "leads" | "loans" | "deals" | "agents";
export type ReportBucket = "week" | "month";
export type ReportBusinessLine = "loans" | "real_estate";
export type LeadsBusinessLine = ReportBusinessLine;
export type SortDir = "asc" | "desc";

export type LeadsReportRow = Schemas["LeadsReportRow"];
export type LoansReportRow = Schemas["LoansReportRow"];
export type DealsReportRow = Schemas["DealsReportRow"];
export type AgentsReportRow = Schemas["AgentsReportRow"];
export type ReportSummary = Schemas["ReportSummary"];
export type AgentsSummary = Schemas["AgentsSummary"];
export type TeamPerformanceSummary = Schemas["TeamPerformanceSummary"];

export type LeadsReportResponse = Schemas["LeadsReportResponse"];
export type LoansReportResponse = Schemas["LoansReportResponse"];
export type DealsReportResponse = Schemas["DealsReportResponse"];
export type AgentsReportResponse = Schemas["AgentsReportResponse"];

export type ReportFilters = {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  bucket?: ReportBucket; // ignored for "agents"
  businessLine?: ReportBusinessLine;
  agentProfileUuids?: string[];
  sortBy?: string;
  sortDir?: SortDir;
  limit?: number;
  offset?: number;
};

export async function getLeadsReport(filters: ReportFilters): Promise<ApiResponse<LeadsReportResponse>> {
  return apiRequest<LeadsReportResponse>(
    `/api/v1/admin/reports/leads?${buildReportParams(filters)}`,
  );
}

export async function getLoansReport(filters: ReportFilters): Promise<ApiResponse<LoansReportResponse>> {
  return apiRequest<LoansReportResponse>(
    `/api/v1/admin/reports/loans?${buildReportParams(filters)}`,
  );
}

export async function getDealsReport(filters: ReportFilters): Promise<ApiResponse<DealsReportResponse>> {
  return apiRequest<DealsReportResponse>(
    `/api/v1/admin/reports/deals?${buildReportParams(filters)}`,
  );
}

export async function getAgentsReport(
  filters: ReportFilters,
): Promise<ApiResponse<AgentsReportResponse>> {
  return apiRequest<AgentsReportResponse>(
    `/api/v1/admin/reports/agents?${buildReportParams(filters)}`,
  );
}

const REPORT_GETTERS = {
  leads: getLeadsReport,
  loans: getLoansReport,
  deals: getDealsReport,
  agents: getAgentsReport,
} as const;

export async function getReport(
  kind: ReportKind,
  filters: ReportFilters,
): Promise<ApiResponse<LeadsReportResponse | LoansReportResponse | DealsReportResponse | AgentsReportResponse>> {
  return REPORT_GETTERS[kind](filters);
}

export async function downloadReportCsv(
  kind: ReportKind,
  filters: ReportFilters,
): Promise<ApiDownloadResponse> {
  const params = buildReportParams(filters);
  const line = filters.businessLine ?? "all";
  const filename = `${kind}-${line}-${filters.dateFrom}_${filters.dateTo}.csv`;
  return apiDownload(`/api/v1/admin/reports/${kind}/export?${params}`, brandedFilename(filename));
}

export async function downloadReportExcel(
  kind: ReportKind,
  filters: ReportFilters,
): Promise<ApiDownloadResponse> {
  const params = buildReportParams(filters);
  const line = filters.businessLine ?? "all";
  const filename = `${kind}-${line}-${filters.dateFrom}_${filters.dateTo}.xlsx`;
  return apiDownload(`/api/v1/admin/reports/${kind}/export.xlsx?${params}`, brandedFilename(filename));
}
