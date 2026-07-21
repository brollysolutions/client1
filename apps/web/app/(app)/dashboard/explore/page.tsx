"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useLine } from "@/features/dashboard/line-provider";
import { EXPLORE_CATEGORIES } from "@/features/dashboard/explore-categories";
import { PropertyBrowser } from "@/features/real-estate/property-browser";
import { PropertyRow } from "@/features/real-estate/property-row";
import { RE_CATEGORIES, RE_LISTINGS, getListingsByCategory } from "@/lib/real-estate";

// Product discovery hub. Loans line shows the loans/cards/insurance tiles
// (coming-soon details). Real-estate line is a search-first hub: a catalog-wide
// omnibox on top, then category tiles with live counts, then a featured strip;
// an active search swaps the hub for a scoped results grid. Auth/role are gated
// by the (app) layout.
export default function ExplorePage() {
  const { activeLine } = useLine();
  const isRealEstate = activeLine === "real_estate";

  if (isRealEstate) {
    return (
      <div className="mx-auto w-full max-w-[1320px] space-y-8 px-4 sm:px-6">
        <PropertyBrowser
          header={
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">Explore</h1>
              <p className="text-sm text-text-secondary">
                Search any property, or browse by type below.
              </p>
            </div>
          }
          idle={<RealEstateHub />}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Explore</h1>
        <p className="text-sm text-text-secondary">
          Discover loans, cards, insurance and properties, all in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {EXPLORE_CATEGORIES.map(({ slug, label, icon: Icon, blurb }) => (
          <CategoryTile key={slug} slug={slug} label={label} Icon={Icon} blurb={blurb} />
        ))}
      </div>
    </div>
  );
}

// Real-estate idle state: category tiles (4-up, with live listing counts) plus a
// featured carousel.
function RealEstateHub() {
  const featured = RE_LISTINGS.slice(0, 10);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">Browse by type</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {RE_CATEGORIES.map((c) => (
            <CategoryTile
              key={c.key}
              slug={c.key}
              label={c.label}
              Icon={c.icon}
              blurb={c.blurb}
              count={getListingsByCategory(c.key).length}
            />
          ))}
        </div>
      </section>

      {featured.length > 0 ? (
        // PropertyRow is a full-bleed carousel (its own edge padding); cancel the
        // hub container's padding so it aligns like the home-page rows.
        <div className="-mx-4 sm:-mx-6">
          <PropertyRow
            id="featured"
            heading="Featured properties"
            blurb="A handful of listings to get you started."
            listings={featured}
          />
        </div>
      ) : null}
    </div>
  );
}

function CategoryTile({
  slug,
  label,
  Icon,
  blurb,
  count,
}: {
  slug: string;
  label: string;
  Icon: LucideIcon;
  blurb: string;
  count?: number;
}) {
  return (
    <Link
      href={`/dashboard/explore/${slug}`}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-loans-soft text-loans-accent">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block font-semibold text-text-primary transition-colors group-hover:text-brand-cta">
            {label}
          </span>
          {count != null ? (
            <span className="rounded-full bg-brand-cta-tint px-2 py-0.5 text-xs font-medium text-brand-cta">
              {count}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-sm text-text-secondary">{blurb}</span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-text-secondary transition-colors group-hover:text-brand-cta"
        aria-hidden
      />
    </Link>
  );
}
