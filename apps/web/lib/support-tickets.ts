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
