// Generated-contract clients for the anonymous Financial Services catalogue.

import type { components } from "@contracts/generated/schema";

import { serverFetchJson } from "@/lib/api/server";

type Schemas = components["schemas"];

export type PublicFinancialProduct = Schemas["PublicFinancialProductRead"];
export type PublicFinancialProductList = Schemas["PublicFinancialProductListResponse"];
export type PublicProviderOffer = Schemas["PublicProviderOfferRead"];
export type PublicProviderOfferList = Schemas["PublicProviderOfferListResponse"];
export type ProviderType = Schemas["ProviderType"];
export type ProductCategory = Schemas["ProductCategory"];

export type ProductCatalogueQuery = {
  q?: string;
  category?: Schemas["ProductCategory"];
  featured?: boolean;
  page?: number;
  pageSize?: number;
};

export type ProviderOfferQuery = {
  q?: string;
  providerType?: ProviderType;
  amount?: string;
  interestRateMax?: string;
  tenureMonths?: string;
  sort?: "recommended" | "interest_rate" | "amount" | "updated";
  page?: number;
  pageSize?: number;
};

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function getPublicFinancialProducts(
  query: ProductCatalogueQuery = {},
  revalidate = 60,
): Promise<PublicFinancialProductList> {
  const suffix = queryString({
    q: query.q,
    category: query.category,
    featured: query.featured,
    page: query.page ?? 1,
    page_size: query.pageSize ?? 12,
  });
  const response = await serverFetchJson<PublicFinancialProductList>(
    `/api/v1/public/financial-products${suffix}`,
    { revalidate },
  );
  return response.ok
    ? response.data
    : { items: [], total: 0, page: query.page ?? 1, page_size: query.pageSize ?? 12 };
}

export type CatalogueFacets = {
  all: number;
  loan: number;
  credit_card: number;
  insurance: number;
};

/**
 * Per-category result counts for the /loans filter pills, narrowed by the
 * active text query so a pill shows what picking it would actually return.
 *
 * Each call asks for a single row and reads `total`, which stays exact past
 * the endpoint's 100-row page cap. `all` is the sum because ProductCategory is
 * closed over exactly these three values.
 */
export async function getCatalogueFacets(q?: string): Promise<CatalogueFacets> {
  const [loan, credit_card, insurance] = await Promise.all(
    (["loan", "credit_card", "insurance"] as const).map((category) =>
      getPublicFinancialProducts({ q, category, page: 1, pageSize: 1 }).then(
        (result) => result.total,
      ),
    ),
  );
  return { all: loan + credit_card + insurance, loan, credit_card, insurance };
}

export async function getPublicFinancialProduct(
  slug: string,
): Promise<PublicFinancialProduct | null> {
  const response = await serverFetchJson<PublicFinancialProduct>(
    `/api/v1/public/financial-products/${encodeURIComponent(slug)}`,
    { revalidate: 60 },
  );
  return response.ok ? response.data : null;
}

export async function getPublicProviderOffers(
  slug: string,
  query: ProviderOfferQuery = {},
): Promise<PublicProviderOfferList> {
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
  const response = await serverFetchJson<PublicProviderOfferList>(
    `/api/v1/public/financial-products/${encodeURIComponent(slug)}/providers${suffix}`,
    { revalidate: 60 },
  );
  return response.ok
    ? response.data
    : { items: [], total: 0, page: query.page ?? 1, page_size: query.pageSize ?? 9 };
}
