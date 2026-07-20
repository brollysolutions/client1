import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { EXPLORE_CATEGORIES } from "@/features/dashboard/explore-categories";

// Product discovery hub. Static tiles for each category; each opens a coming-soon
// detail until the real catalog lands. Auth/role are gated by the (app) layout.
export default function ExplorePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Explore</h1>
        <p className="text-sm text-text-secondary">
          Discover loans, cards, insurance and properties, all in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {EXPLORE_CATEGORIES.map(({ slug, label, icon: Icon, blurb }) => (
          <Link
            key={slug}
            href={`/dashboard/explore/${slug}`}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-loans-soft text-loans-accent">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-text-primary transition-colors group-hover:text-sky-500">
                {label}
              </span>
              <span className="block truncate text-sm text-text-secondary">{blurb}</span>
            </span>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-text-secondary transition-colors group-hover:text-sky-500"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
