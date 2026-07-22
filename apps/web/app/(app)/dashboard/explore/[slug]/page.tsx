import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ComingSoon } from "@/features/dashboard/coming-soon";
import {
  EXPLORE_CATEGORIES,
  getExploreCategory,
} from "@/features/dashboard/explore-categories";
import { CategoryBrowser } from "@/features/real-estate/category-browser";
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
    <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 sm:px-6">
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
          header={
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">{label}</h1>
              <p className="text-sm text-text-secondary">{blurb}</p>
            </div>
          }
        />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{label}</h1>
            <p className="text-sm text-text-secondary">{blurb}</p>
          </div>
          <ComingSoon
            icon={loansCategory!.icon}
            title={`${loansCategory!.label} is coming soon`}
            description={loansCategory!.description}
            accentClassName="bg-loans-soft text-loans-accent"
          />
        </>
      )}
    </div>
  );
}
