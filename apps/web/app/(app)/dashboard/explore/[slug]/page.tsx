import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ComingSoon } from "@/features/dashboard/coming-soon";
import {
  EXPLORE_CATEGORIES,
  getExploreCategory,
} from "@/features/dashboard/explore-categories";

export function generateStaticParams() {
  return EXPLORE_CATEGORIES.map((c) => ({ slug: c.slug }));
}

export default async function ExploreCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getExploreCategory(slug);
  if (!category) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/explore"
        className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary transition-colors hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Explore
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{category.label}</h1>
        <p className="text-sm text-text-secondary">{category.blurb}</p>
      </div>

      <ComingSoon
        icon={category.icon}
        title={`${category.label} is coming soon`}
        description={category.description}
        accentClassName="bg-loans-soft text-loans-accent"
      />
    </div>
  );
}
