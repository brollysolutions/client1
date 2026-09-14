import type { CatalogueFacets, PublicFinancialProduct, PublicFinancialProductList } from "@/lib/financial-catalog";
import type { CatalogueQuery } from "@/lib/financial-catalogue-url";
import { financialServiceHref, findFinancialService } from "@/lib/products";

// The API owns visibility and ordering. The static registry supplies artwork
// and legacy anchors only; it must never recreate an inactive or deleted row.
export type ServiceDirectoryItem = Pick<PublicFinancialProduct, "slug" | "label" | "summary" | "category"> & {
  id: string;
  legacyAnchorId?: string;
  detailHref?: string;
};
export type ServiceDirectoryPage = Omit<PublicFinancialProductList, "items"> & { items: ServiceDirectoryItem[] };

export function serviceAnchor(slug: string): string {
  return slug === "credit-card" ? "credit-cards" : slug;
}

export function buildServiceDirectory(
  published: readonly PublicFinancialProduct[],
  query: CatalogueQuery = {},
  pageSize = 24,
): { catalogue: ServiceDirectoryPage; facets: CatalogueFacets } {
  const byAnchor = new Map(published.map((product) => [serviceAnchor(product.slug), product]));
  const items: ServiceDirectoryItem[] = [...byAnchor].map(([anchor, product]) => {
    return {
      id: anchor,
      slug: product.slug,
      label: product.label,
      summary: product.summary,
      category: product.category,
      legacyAnchorId: findFinancialService(product.slug)?.legacyAnchorId,
      detailHref: financialServiceHref(product.slug),
    };
  });

  const search = query.q?.trim().toLowerCase();
  const matching = search ? items.filter((item) => `${item.label} ${item.summary} ${item.id}`.toLowerCase().includes(search)) : items;
  const facets: CatalogueFacets = { all: matching.length, loan: 0, insurance: 0, credit_card: 0 };
  for (const item of matching) facets[item.category] += 1;
  const filtered = query.category ? matching.filter((item) => item.category === query.category) : matching;
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  return { catalogue: { items: filtered.slice((page - 1) * pageSize, page * pageSize), total, page, page_size: pageSize }, facets };
}
