import * as React from "react";
import Link from "next/link";

import { RE_CATEGORIES, type REListing } from "@/lib/real-estate";
import { cn } from "@/lib/utils";

// Every category the platform publishes, with its live count, linking into the
// matching Explore page.
//
// The carousels below only render categories that currently have listings
// (property-row.tsx), which silently erases a whole category from the page when
// its count is zero. This strip is what keeps all of them reachable: an empty
// category reads as "nothing here yet" instead of not existing, and still opens
// its Explore page so a client can look for themselves.
export function CategoryStrip({ listings }: { listings: REListing[] }) {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    counts.set(listing.category, (counts.get(listing.category) ?? 0) + 1);
  }

  return (
    <section aria-label="Browse by property type">
      <h2 className="px-4 font-heading text-xl font-semibold text-text-primary sm:px-6 lg:px-10">
        Browse by property type
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-5 lg:px-10">
        {RE_CATEGORIES.map((category) => {
          const count = counts.get(category.key) ?? 0;
          const Icon = category.icon;
          return (
            <li key={category.key}>
              <Link
                href={`/dashboard/explore/${category.key}`}
                className={cn(
                  "flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors",
                  "hover:border-brand-cta hover:bg-brand-cta-tint",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta/40",
                  count === 0 && "border-dashed",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    count === 0 ? "bg-muted text-text-secondary" : "bg-brand-cta-tint text-brand-cta",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-text-primary">{category.label}</span>
                <span className="text-xs text-text-secondary">
                  {count === 0
                    ? "No listings yet"
                    : `${count} propert${count === 1 ? "y" : "ies"}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
