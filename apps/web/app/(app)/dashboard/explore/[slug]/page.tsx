import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { ExploreArtCard } from "@/features/dashboard/explore-cards";
import {
  EXPLORE_CATEGORIES,
  getExploreCategory,
  shouldRedirectToSoleProduct,
} from "@/features/dashboard/explore-categories";
import { CategoryBrowser } from "@/features/real-estate/category-browser";
import { getPublicFinancialProducts } from "@/lib/financial-catalog";
import { catalogueIllustration } from "@/lib/products";
import { getRECategory, RE_CATEGORIES } from "@/lib/real-estate";

export function generateStaticParams() {
  return [
    ...EXPLORE_CATEGORIES.map((c) => ({ slug: c.slug })),
    ...RE_CATEGORIES.map((c) => ({ slug: c.key })),
  ];
}

export default async function ExploreCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const reCategory = getRECategory(slug);
  const loansCategory = getExploreCategory(slug);
  if (!reCategory && !loansCategory) notFound();

  const label = reCategory?.label ?? loansCategory!.label;
  const blurb = reCategory?.blurb ?? loansCategory!.blurb;

  return (
    <DashboardPage>
      <Link
        href="/dashboard/explore"
        className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary transition-colors hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Explore
      </Link>

      {reCategory ? (
        // Search + filters scoped to this category only (ceiling = this
        // category's listings; the Property-type facet is hidden). The catalog
        // is fetched client-side (CategoryBrowser) since the token is in-memory.
        <CategoryBrowser
          categoryKey={reCategory.key}
          header={<DashboardHeader title={label} description={blurb} />}
        />
      ) : (
        <LoansCategoryProducts category={loansCategory!} label={label} blurb={blurb} />
      )}
    </DashboardPage>
  );
}

// Loans/insurance/credit-card category: the Admin-published products in this
// category from the anonymous public financial-products catalogue (same
// source /loans reads). pageSize is generous since a category realistically
// holds a handful of products, not paginated volume.
async function LoansCategoryProducts({
  category,
  label,
  blurb,
}: {
  category: NonNullable<ReturnType<typeof getExploreCategory>>;
  label: string;
  blurb: string;
}) {
  const catalogue = await getPublicFinancialProducts({ category: category.category, pageSize: 100 });

  if (shouldRedirectToSoleProduct(category.slug, catalogue.items.length)) {
    redirect(`/dashboard/explore/${category.slug}/${catalogue.items[0].slug}`);
  }

  return (
    <>
      <DashboardHeader title={label} description={blurb} />

      {catalogue.items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {catalogue.items.map((product) => (
            <ExploreArtCard
              key={product.id}
              href={`/dashboard/explore/${category.slug}/${product.slug}`}
              title={product.label}
              blurb={product.summary}
              illustration={catalogueIllustration(product.slug)}
              fallbackIcon={category.icon}
              meta={
                product.provider_count > 0
                  ? `${product.provider_count} lender${product.provider_count === 1 ? "" : "s"}`
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-text-primary">No {label.toLowerCase()} products yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            New products will appear here once they are published. Check back soon.
          </p>
        </div>
      )}
    </>
  );
}
