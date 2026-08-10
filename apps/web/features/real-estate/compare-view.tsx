"use client";

import Link from "next/link";
import { Scale, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { useBookmarks, useCompare } from "@/features/real-estate/store";
import { useProperties } from "@/features/real-estate/use-properties";
import type { REListing } from "@/lib/real-estate";
import { cn } from "@/lib/utils";

const COMPARE_ROWS: { label: string; getValue: (l: REListing) => string }[] = [
  { label: "Type", getValue: (l) => l.type },
  { label: "Location", getValue: (l) => l.location },
  { label: "Price", getValue: (l) => l.price },
  { label: "Details", getValue: (l) => l.meta ?? "—" },
];

// Side-by-side comparison of up to 3 selected properties. Selections come from
// the "Add to compare" checkbox on any property card; bookmarked-but-not-yet-
// compared properties are offered as quick-add chips.
export function CompareView() {
  const compare = useCompare();
  const bookmarks = useBookmarks();
  const { listings: catalog } = useProperties();

  // Resolve compare/bookmark ids against the fetched catalog (ids are real
  // property UUIDs); anything no longer in the catalog is dropped.
  const byId = new Map(catalog.map((l) => [l.id, l]));
  const listings = compare.ids
    .map((id) => byId.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  const addable = bookmarks.ids
    .filter((id) => !compare.has(id))
    .map((id) => byId.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Real Estate shortlist"
        title="Compare properties"
        description="Review up to three saved properties side by side using the same core details."
        actions={listings.length > 0 ? (
          <Button variant="outline" size="sm" onClick={compare.clear}>
            Clear all
          </Button>
        ) : undefined}
      />

      <MetricGrid>
        <MetricCard label="Comparing" value={`${listings.length}/3`} icon={DASHBOARD_ICONS.compare} />
        <MetricCard label="Bookmarks" value={bookmarks.ids.length} icon={DASHBOARD_ICONS.bookmarks} />
        <MetricCard label="Quick-add options" value={addable.length} icon={DASHBOARD_ICONS.propertyListings} />
        <MetricCard label="Catalog" value={catalog.length} icon={DASHBOARD_ICONS.explore} href="/dashboard/explore" />
      </MetricGrid>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <Scale className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">Nothing to compare yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Check &quot;Add to compare&quot; on any property card to see it here.
          </p>
          <Link
            href="/dashboard/explore"
            className="mt-4 inline-block text-sm font-semibold text-brand-cta hover:underline"
          >
            Explore properties
          </Link>
        </div>
      ) : (
        <DashboardPanel title="Side-by-side details" description="Remove an item at any time to make room for another property.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-32 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary" />
                {listings.map((listing) => (
                  <th key={listing.id} className="min-w-[200px] px-5 py-3 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-text-primary">{listing.title}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${listing.title} from compare`}
                        onClick={() => compare.remove(listing.id)}
                        className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(({ label, getValue }) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    {label}
                  </td>
                  {listings.map((listing) => (
                    <td
                      key={listing.id}
                      className={cn(
                        "px-5 py-4",
                        label === "Price"
                          ? "font-heading font-semibold text-brand-blue"
                          : "text-text-primary",
                      )}
                    >
                      {getValue(listing)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </DashboardPanel>
      )}

      {listings.length < 3 && addable.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-text-secondary">Add from your bookmarks</p>
          <div className="flex flex-wrap gap-2">
            {addable.map((listing) => (
              <button
                key={listing.id}
                type="button"
                onClick={() => compare.add(listing.id)}
                className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-sm text-text-primary transition-colors hover:border-brand-cta hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                + {listing.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
