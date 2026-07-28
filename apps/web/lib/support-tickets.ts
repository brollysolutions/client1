// Support tickets client for the authenticated dashboard.
//
// Calls /api/v1/support-tickets/* through the typed fetch wrapper in
// lib/api/client.ts. Wire shapes come from the generated contract; this maps
// them to the camelCase shape the UI consumes (same pattern as lib/loans.ts).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type SupportCategory = Schemas["SupportCategory"];
export type SupportStatus = Schemas["SupportStatus"];

export type SupportTicket = {
  id: string;
  category: SupportCategory;
  subject: string;
  body: string;
  status: SupportStatus;
  createdOn: string; // ISO date
};

// Shared between the client's own ticket list (app/(app)/dashboard/support/page.tsx)
// and the Admin console (features/admin/support-tickets-view.tsx) so the two
// surfaces can never show different words for the same category/status.
export const CATEGORY_LABEL: Record<SupportCategory, string> = {
  account_login: "Login problem",
  otp: "OTP not received",
  lost_mobile: "Lost my mobile number",
  general: "Something else",
};

export const CATEGORIES: SupportCategory[] = ["account_login", "otp", "lost_mobile", "general"];

export const STATUS_STYLES: Record<SupportStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-warning/10 text-warning" },
  in_progress: { label: "In progress", className: "bg-loans-soft text-loans-accent" },
  resolved: { label: "Resolved", className: "bg-success/10 text-success" },
  closed: { label: "Closed", className: "bg-muted text-text-secondary" },
};

function mapTicket(raw: Schemas["SupportTicketRead"]): SupportTicket {
  return {
    id: raw.id,
    category: raw.category,
    subject: raw.subject,
    body: raw.body,
    status: raw.status,
    createdOn: raw.created_at,
  };
}

export async function getSupportTickets(): Promise<ApiResponse<SupportTicket[]>> {
  const res = await apiRequest<Schemas["SupportTicketListResponse"]>(
    "/api/v1/support-tickets/tickets",
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.tickets.map(mapTicket) };
}

export async function createSupportTicket(input: {
  category: SupportCategory;
  subject: string;
  body: string;
}): Promise<ApiResponse<SupportTicket>> {
  const res = await apiRequest<Schemas["SupportTicketRead"]>(
    "/api/v1/support-tickets/tickets",
    {
      method: "POST",
      body: {
        category: input.category,
        subject: input.subject,
        body: input.body,
      } satisfies Schemas["SupportTicketCreate"],
    },
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapTicket(res.data) };
}
