"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandInput } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ExploreArtCard } from "@/features/dashboard/explore-cards";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { SuggestionsList, useSuggestionMatches } from "@/features/real-estate/property-suggestions";
import {
  SEARCH_FIELD_BUTTON_MOTION_CLASS,
  SEARCH_FIELD_CLEAR_BUTTON_CLASS,
  SEARCH_FIELD_SHELL_CLASS,
  SearchFieldIcon,
} from "@/features/real-estate/search-field-chrome";
import { useBookmarks } from "@/features/real-estate/store";
import { useEnquiries } from "@/features/real-estate/use-enquiries";
import { useProperties } from "@/features/real-estate/use-properties";
import { nextUpcomingVisit, useSiteVisits } from "@/features/real-estate/use-site-visits";
import { buildSuggestionIndex } from "@/lib/property-facets";
import { RE_CATEGORIES, type RESubtype } from "@/lib/real-estate";
import { cn } from "@/lib/utils";

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
// counts come from real, already-RLS-scoped APIs that already power their own
// full dashboard pages. The quick search below shares Explore's omnibox --
// same shell, same location/property suggestions as you type -- but hands
// picks off to Explore (same nuqs facet keys) rather than rendering a results
// grid or filter engine of its own; Home still fetches the property catalog
// only to power those suggestions, never to browse it.
export function RealEstateHome() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const bookmarks = useBookmarks();
  const { enquiries, status: enquiriesStatus } = useEnquiries();
  const { siteVisits, status: siteVisitsStatus } = useSiteVisits();
  // Fetched only to power this field's location/property suggestions -- the
  // one piece of Explore's omnibox this quick search shares, so typing here
  // behaves the same as typing there. Home still renders none of Explore's
  // browsing UI (no results grid, no filters, no live category counts), and a
  // slow or failing fetch only means suggestions stay empty; it can never gate
  // or break this page's own personal-status content, so loading/error are
  // deliberately not read here (same tradeoff already established for the
  // dashboard property-detail page's parallel catalog fetch).
  const { listings } = useProperties();
  const suggestionIndex = React.useMemo(() => buildSuggestionIndex(listings), [listings]);
  const { matches, hasMatches } = useSuggestionMatches(query, suggestionIndex);

  function goToExplore(params: string) {
    setSuggestionsOpen(false);
    router.push(`/dashboard/explore?${params}`);
  }

  function submitSearch() {
    const trimmed = query.trim();
    goToExplore(trimmed ? `q=${encodeURIComponent(trimmed)}` : "");
  }

  function pickLocality(value: string) {
    goToExplore(`locality=${encodeURIComponent(value)}`);
  }
  function pickCity(value: string) {
    goToExplore(`city=${encodeURIComponent(value)}`);
  }
  function pickPincode(value: string) {
    goToExplore(`pincode=${encodeURIComponent(value)}`);
  }
  function pickSubtype(value: RESubtype) {
    goToExplore(`subtypes=${value}`);
  }
  function pickProperty(title: string) {
    goToExplore(`q=${encodeURIComponent(title)}`);
  }

  function clearQuery() {
    setQuery("");
    inputRef.current?.focus();
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

      {/* Same shell, icon, animation, and suggestion popover as Explore/
          category/Bookmarks' omnibox (search-field-chrome.tsx,
          property-suggestions.tsx), so typing here behaves exactly like
          typing there. Picking a suggestion hands off straight to Explore
          with the matching facet already applied instead of setting local
          filter state, since Home owns no results grid of its own -- that
          richness stays on Explore; this just gets you there faster. */}
      <Command shouldFilter={false} className="w-full overflow-visible bg-transparent">
        <Popover open={suggestionsOpen && matches !== null} onOpenChange={setSuggestionsOpen}>
          <PopoverAnchor asChild>
            <div className={SEARCH_FIELD_SHELL_CLASS}>
              <SearchFieldIcon />
              <CommandInput
                ref={inputRef}
                value={query}
                onValueChange={(value) => {
                  setQuery(value.slice(0, 100));
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                aria-label="Search properties"
                placeholder="Search by locality, city, or property name..."
                // CommandInput's own built-in icon is hidden: SearchFieldIcon
                // above is the one leading icon this field shows.
                wrapperClassName="h-full min-w-0 flex-1 border-b-0 px-3 [&>svg]:hidden"
                className="h-full text-base"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clearQuery}
                  aria-label="Clear search"
                  className={cn("mr-1", SEARCH_FIELD_CLEAR_BUTTON_CLASS)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
              <Button
                type="button"
                onClick={submitSearch}
                className={cn("m-1.5 h-11 shrink-0 rounded-lg px-5", SEARCH_FIELD_BUTTON_MOTION_CLASS)}
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Search
              </Button>
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="w-[var(--radix-popper-anchor-width)] p-0"
          >
            <SuggestionsList
              matches={matches}
              hasMatches={hasMatches}
              queryText={query}
              onPickLocality={pickLocality}
              onPickCity={pickCity}
              onPickPincode={pickPincode}
              onPickSubtype={pickSubtype}
              onPickProperty={pickProperty}
            />
          </PopoverContent>
        </Popover>
      </Command>

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
        {/* Navigation, not a filter -- no active/selected state and no live
            counts (Explore's own per-category rows carry those). Illustrated
            cards (ExploreArtCard, already established on the Explore/loans
            hub) instead of plain pill buttons, so every property type reads
            as an inviting destination rather than a filter toggle. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {RE_CATEGORIES.map((category) => (
            <ExploreArtCard
              key={category.key}
              href={`/dashboard/explore/${category.key}`}
              title={category.label}
              blurb={category.blurb}
              illustration={category.illustration}
              fallbackIcon={category.icon}
            />
          ))}
        </div>
      </section>
    </DashboardPage>
  );
}
