import type { CatalogueFacets, PublicFinancialProduct, PublicFinancialProductList } from "@/lib/financial-catalog";
import type { CatalogueCategory, CatalogueQuery } from "@/lib/financial-catalogue-url";
import { financialServiceHref, LOAN_PRODUCTS, type ProductGroup } from "@/lib/products";

// Every public marketing service has an overview page. Its provider/application
// journey is available only when the detail route receives published API data.
export type ServiceDirectoryItem = Pick<PublicFinancialProduct, "slug" | "label" | "summary" | "category"> & {
  id: string;
  legacyAnchorId?: string;
  detailHref?: string;
};
export type ServiceDirectoryPage = Omit<PublicFinancialProductList, "items"> & { items: ServiceDirectoryItem[] };

const CATEGORY: Record<ProductGroup, CatalogueCategory> = {
  loans: "loan",
  insurance: "insurance",
  "credit-cards": "credit_card",
};

export function serviceAnchor(slug: string): string {
  return slug === "credit-card" ? "credit-cards" : slug;
}

export function buildServiceDirectory(
  published: readonly PublicFinancialProduct[],
  query: CatalogueQuery = {},
  pageSize = 24,
): { catalogue: ServiceDirectoryPage; facets: CatalogueFacets } {
  const byAnchor = new Map(published.map((product) => [serviceAnchor(product.slug), product]));
  const known = new Set(LOAN_PRODUCTS.map((product) => product.id));
  const items: ServiceDirectoryItem[] = LOAN_PRODUCTS.map((service) => {
    const product = byAnchor.get(service.id);
    return {
      id: service.id,
      slug: product?.slug ?? service.id,
      label: product?.label ?? service.label,
      summary: product?.summary ?? service.description,
      category: CATEGORY[service.group],
      legacyAnchorId: service.legacyAnchorId,
      detailHref: financialServiceHref(service.id),
    };
  });
  for (const [anchor, product] of byAnchor) {
    if (known.has(anchor)) continue;
    items.push({ id: anchor, slug: product.slug, label: product.label, summary: product.summary, category: product.category, detailHref: `/loans/${product.slug}` });
  }

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
