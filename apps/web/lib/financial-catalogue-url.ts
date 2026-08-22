// URL contract for the public Financial Services catalogue on /loans.
//
// Shared by the server component (pagination links, the empty state's escape
// hatch) and the client filter island (debounced search, category pills), so
// both write exactly the same query shape. Kept out of lib/financial-catalog.ts
// because that module pulls in the server-only fetch wrapper.

export type CatalogueCategory = "loan" | "credit_card" | "insurance";

export type CatalogueQuery = {
  q?: string;
  category?: CatalogueCategory;
  page?: number;
};

/** Section id on /loans. Every catalogue link targets it so a filter or page
 *  change lands on the results instead of the top of the marketing hero. */
export const CATALOGUE_ANCHOR = "financial-services-catalogue";

export const CATEGORY_LABEL: Record<CatalogueCategory, string> = {
  loan: "Loans and funding",
  credit_card: "Credit cards",
  insurance: "Insurance",
};

/** Short forms for the filter pills, where the row is horizontally tight. */
export const CATEGORY_PILL_LABEL: Record<CatalogueCategory, string> = {
  loan: "Loans",
  credit_card: "Credit cards",
  insurance: "Insurance",
};

export const CATALOGUE_CATEGORIES: CatalogueCategory[] = [
  "loan",
  "credit_card",
  "insurance",
];

export function parseCatalogueCategory(
  value: string | undefined,
): CatalogueCategory | undefined {
  return value === "loan" || value === "credit_card" || value === "insurance"
    ? value
    : undefined;
}

/** Builds a /loans URL for the catalogue. Page 1 is left implicit so the
 *  unfiltered first page keeps the canonical `/loans` URL. */
export function catalogueHref(query: CatalogueQuery = {}): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const suffix = params.toString();
  return suffix ? `/loans?${suffix}` : "/loans";
}

/** Same as `catalogueHref`, anchored at the results section. Used for real
 *  navigations (pagination, clearing from the empty state); the filter island
 *  deliberately omits the hash because it never scrolls. */
export function catalogueAnchorHref(query: CatalogueQuery = {}): string {
  return `${catalogueHref(query)}#${CATALOGUE_ANCHOR}`;
}
