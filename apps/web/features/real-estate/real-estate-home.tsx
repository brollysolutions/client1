"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { useBookmarks } from "@/features/real-estate/store";
import { useEnquiries } from "@/features/real-estate/use-enquiries";
import { nextUpcomingVisit, useSiteVisits } from "@/features/real-estate/use-site-visits";
import { RE_CATEGORIES } from "@/lib/real-estate";

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// MetricCard renders `value` inside a <p>, which only permits inline
// (phrasing) content -- the shared Skeleton component renders a <div>,
// which is invalid there and breaks hydration. This is the inline
// equivalent: same pulse/bg-accent treatment, valid as a <p> descendant.
function ValueSkeleton() {
  return <span className="inline-block h-7 w-10 animate-pulse rounded-md bg-accent align-middle" />;
}

function BrowseCta() {
  return (
    <Link
      href="/dashboard/explore"
      className="inline-flex items-center gap-2 rounded-lg bg-brand-cta px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta focus-visible:ring-offset-2"
    >
      <DASHBOARD_ICONS.explore className="h-4 w-4" aria-hidden="true" />
      Browse properties
    </Link>
  );
}

// Real-estate client Home: a personal "my property journey" status view, not
// a second catalog browser. Home used to duplicate Explore almost exactly --
// same catalog fetch, same search bar, same category-browsing idle state --
// because neither page was ever given a distinct job (see PR history: the
// Explore hub was moved unchanged when loans Explore was redesigned, then
// Home was redesigned in isolation). This mirrors the loans line instead,
// where Home is a personal status view (LoansApplications: "my applications")
// and Explore is the catalog discovery hub. Bookmarks/enquiries/site-visit
// counts come from real, already-RLS-scoped APIs that already power their
// own full dashboard pages; the quick search below hands off to Explore
// (same nuqs `q` key) rather than re-implementing its omnibox/filter engine
// here. Home fetches none of the property catalog itself.
export function RealEstateHome() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  const bookmarks = useBookmarks();
  const { enquiries, status: enquiriesStatus } = useEnquiries();
  const { siteVisits, status: siteVisitsStatus } = useSiteVisits();

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/dashboard/explore?q=${encodeURIComponent(trimmed)}` : "/dashboard/explore");
  }

  const newEnquiries = enquiries.filter((enquiry) => enquiry.status === "new").length;
  const nextVisit = nextUpcomingVisit(siteVisits);

  return (
    <DashboardPage>
      <DashboardHeader
        title="Your property journey"
        description="Track what you've saved and asked about, and pick up your search."
        actions={<BrowseCta />}
      />

      <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
        {/* Chrome echoes the Explore search field (h-14, rounded-xl, brand-cta
            focus ring) so it reads as the same product, but carries none of
            its machinery -- no debounce, no suggestion popover, no chips, no
            filter sheet. That richness belongs to Explore; this just hands
            off a query and gets out of the way. */}
        <div className="flex h-14 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-4 transition-colors focus-within:border-brand-cta focus-within:ring-2 focus-within:ring-brand-cta/25">
          <Search className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search properties"
            placeholder="Search by locality, city, or property name..."
            className="h-full border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <Button type="submit" className="h-14 shrink-0 rounded-xl px-6 sm:w-auto">
          <Search className="h-4 w-4" aria-hidden="true" />
          Search
        </Button>
      </form>

      <MetricGrid>
        <MetricCard
          label="Bookmarks"
          value={bookmarks.status === "loading" ? <ValueSkeleton /> : bookmarks.count}
          icon={DASHBOARD_ICONS.bookmarks}
          href="/dashboard/bookmarks"
          hint={bookmarks.count > 0 ? "Saved for later" : "Save properties you like"}
        />
        <MetricCard
          label="Enquiries"
          value={enquiriesStatus === "loading" ? <ValueSkeleton /> : enquiries.length}
          icon={DASHBOARD_ICONS.enquiries}
          href="/dashboard/enquiries"
          attention={newEnquiries > 0}
          hint={
            enquiriesStatus === "loading"
              ? undefined
              : newEnquiries > 0
                ? `${newEnquiries} awaiting a reply`
                : "No open enquiries"
          }
        />
        <MetricCard
          label="Site visits"
          value={siteVisitsStatus === "loading" ? <ValueSkeleton /> : siteVisits.length}
          icon={DASHBOARD_ICONS.siteVisits}
          href="/dashboard/site-visits"
          hint={
            siteVisitsStatus === "loading"
              ? undefined
              : nextVisit
                ? `Next: ${formatShortDate(nextVisit.preferredDate)}`
                : "No visits scheduled"
          }
        />
      </MetricGrid>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Browse by property type</h2>
          <Link
            href="/dashboard/explore"
            className="rounded text-sm font-medium text-brand-cta hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta/40"
          >
            View all
          </Link>
        </div>
        {/* Navigation, not a filter -- no active/selected state, no live
            counts (that would mean re-fetching the whole catalog on Home,
            exactly what this rework removes). Explore's own CategoryStrip
            carries the live counts. */}
        <div className="flex flex-wrap gap-2">
          {RE_CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.key}
                href={`/dashboard/explore/${category.key}`}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-text-secondary transition-colors hover:border-brand-cta hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta/40"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {category.label}
              </Link>
            );
          })}
        </div>
      </section>
    </DashboardPage>
  );
}
