"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { useLine } from "@/features/dashboard/line-provider";
import { EXPLORE_CATEGORIES } from "@/features/dashboard/explore-categories";
import { RE_CATEGORIES } from "@/lib/real-estate";

// Product discovery hub. Loans line shows the loans/cards/insurance tiles
// (coming-soon details); real-estate line shows the property-type tiles, each
// opening that category's listings grid. Auth/role are gated by the (app) layout.
export default function ExplorePage() {
  const { activeLine } = useLine();
  const isRealEstate = activeLine === "real_estate";

  const tiles = isRealEstate
    ? RE_CATEGORIES.map((c) => ({ slug: c.key, label: c.label, icon: c.icon, blurb: c.blurb }))
    : EXPLORE_CATEGORIES;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Explore</h1>
        <p className="text-sm text-text-secondary">
          {isRealEstate
            ? "Browse properties by type, all in one place."
            : "Discover loans, cards, insurance and properties, all in one place."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map(({ slug, label, icon: Icon, blurb }) => (
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
