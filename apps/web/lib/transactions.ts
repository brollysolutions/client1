// Transactions client for the authenticated dashboard.
//
// Calls /api/v1/transactions through the typed fetch wrapper in
// lib/api/client.ts. Wire shapes come from the generated contract; this maps
// them to the camelCase shape the UI consumes (same pattern as lib/site-visits.ts).
// Read-only: there is no create endpoint, rows come from a future money-layer producer.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type TransactionType = Schemas["TransactionType"];
export type TransactionStatus = Schemas["TransactionStatus"];

export type Transaction = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amountPaise: number;
  currency: string;
  description: string;
  createdAt: string;
};

function mapTransaction(raw: Schemas["TransactionRead"]): Transaction {
  return {
    id: raw.id,
    type: raw.type,
    status: raw.status,
    amountPaise: raw.amount_paise,
    currency: raw.currency,
    description: raw.description,
    createdAt: raw.created_at,
  };
}

export async function getTransactions(): Promise<ApiResponse<Transaction[]>> {
  const res = await apiRequest<Schemas["TransactionListResponse"]>("/api/v1/transactions");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.transactions.map(mapTransaction) };
}
