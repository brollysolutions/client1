"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { useLine } from "@/features/dashboard/line-provider";
import { PropertyBrowser } from "@/features/real-estate/property-browser";
import { PropertyRow } from "@/features/real-estate/property-row";
import { useProperties } from "@/features/real-estate/use-properties";
import { RE_CATEGORIES, type REListing } from "@/lib/real-estate";

// Line switch for /dashboard/explore. The loans hub is a server component
// (its data comes from the anonymous public financial-products catalogue via
// lib/financial-catalog.ts, which throws if imported client-side), so the
// parent page renders it and hands the finished node in as `loansHub` --
// a client component cannot render an async server child directly. The
// real-estate hub stays exactly as it was: a client-side fetch of the
// property catalog feeding a search-first browser.
export function ExploreLineSwitch({ loansHub }: { loansHub: ReactNode }) {
  const { activeLine } = useLine();
  return activeLine === "real_estate" ? <RealEstateExplore /> : <>{loansHub}</>;
}

// Real-estate Explore: fetches the catalog once, then feeds the client-side
// browser (omnibox + filters over the full active set). The token is in-memory,
// so this must be a client fetch, not a server component.
function RealEstateExplore() {
  const { listings, loading, error, retry } = useProperties();

  const header = (
    <DashboardHeader
      title="Explore properties"
      description="Search by property, locality, city, or PIN code, or choose a catalog location directly."
    />
  );

  return (
    <DashboardPage>
      {loading ? (
        <>
          {header}
          <Skeleton className="h-40 rounded-xl" />
        </>
      ) : error ? (
        <>
          {header}
          <FetchError status={null} message={error} onRetry={retry} />
        </>
      ) : listings.length === 0 ? (
        <>
          {header}
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <h2 className="text-lg font-semibold text-text-primary">No listings yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              New properties will appear here once they are published. Check back soon.
            </p>
          </div>
        </>
      ) : (
        <PropertyBrowser
          source={listings}
          header={header}
          idle={<RealEstateHub listings={listings} />}
        />
      )}
    </DashboardPage>
  );
}

// Real-estate idle state: category tiles (4-up, with live listing counts) plus a
// featured carousel, both derived from the fetched catalog.
function RealEstateHub({ listings }: { listings: REListing[] }) {
  const featured = listings.slice(0, 10);

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
              count={listings.filter((l) => l.category === c.key).length}
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
