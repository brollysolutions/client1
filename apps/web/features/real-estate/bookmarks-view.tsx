"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";

import { PropertyBrowser } from "@/features/real-estate/property-browser";
import { useBookmarks } from "@/features/real-estate/store";
import { getListingById } from "@/lib/real-estate";

// Bookmarked-properties grid. Reads ids from the shared bookmarks store and
// resolves them against the mock catalog; a ghost bookmark (removed from the
// catalog) is silently dropped rather than shown broken. Search + filter are
// scoped to the bookmarked set and sit beside the heading.
export function BookmarksView() {
  const { ids } = useBookmarks();
  const listings = ids.map(getListingById).filter((l): l is NonNullable<typeof l> => Boolean(l));

  const heading = (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Bookmarks</h1>
      <p className="text-sm text-text-secondary">Properties you have saved for later.</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 sm:px-6">
      {listings.length === 0 ? (
        <>
          {heading}
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
              <Bookmark className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-text-primary">No bookmarks yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              Tap the bookmark icon on any property to save it here.
            </p>
            <Link
              href="/dashboard/explore"
              className="mt-4 inline-block text-sm font-semibold text-brand-cta hover:underline"
            >
              Explore properties
            </Link>
          </div>
        </>
      ) : (
        <PropertyBrowser source={listings} header={heading} />
      )}
    </div>
  );
}
