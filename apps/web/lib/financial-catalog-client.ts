// Client-safe twin of lib/financial-catalog.ts's product/offer readers.
//
// lib/financial-catalog.ts goes through the server-only serverFetchJson
// (lib/api/server.ts throws if imported client-side) and every other
// consumer of it is a Server Component, so that's normally the right module.
// The Compare Loan Offers page can't use it: it reacts to a client-only
// localStorage shortlist (features/loans/loan-offers-store.tsx), so it must
// resolve shortlisted {offerId, productSlug} pairs against the same
// anonymous public catalogue from the browser, via apiRequest (the same
// client-fetch pattern lib/loans.ts uses for the authenticated /loans
// endpoints). Same wire shapes and endpoints as financial-catalog.ts --
// just fetched from the client instead of the server.

import { apiRequest, type ApiResponse } from "@/lib/api/client";
import type {
  PublicFinancialProduct,
  PublicProviderOfferList,
  ProviderOfferQuery,
} from "@/lib/financial-catalog";

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function getPublicFinancialProductClient(
  slug: string,
): Promise<ApiResponse<PublicFinancialProduct>> {
  return apiRequest<PublicFinancialProduct>(
    `/api/v1/public/financial-products/${encodeURIComponent(slug)}`,
  );
}

export async function getPublicProviderOffersClient(
  slug: string,
  query: ProviderOfferQuery = {},
): Promise<ApiResponse<PublicProviderOfferList>> {
  const suffix = queryString({
    q: query.q,
    provider_type: query.providerType,
    amount: query.amount,
    interest_rate_max: query.interestRateMax,
    tenure_months: query.tenureMonths,
    sort: query.sort ?? "recommended",
    page: query.page ?? 1,
    page_size: query.pageSize ?? 9,
  });
  return apiRequest<PublicProviderOfferList>(
    `/api/v1/public/financial-products/${encodeURIComponent(slug)}/providers${suffix}`,
  );
}
