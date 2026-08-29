"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, Check, MapPin, Scale } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookmarks, useCompare } from "@/features/real-estate/store";
import type { REListing } from "@/lib/real-estate";
import { isReraVerified, resolvePropertyArtwork } from "@/lib/property-artwork";
import { cn } from "@/lib/utils";

// Category rails and result grids share one browse-first card. Generated
// artwork remains a render-only fallback and is never represented as uploaded
// media. Enquiry, site visits, media, and full facts live on the detail page.
export function PropertyCard({ listing, fluid = false }: { listing: REListing; fluid?: boolean }) {
  const bookmarks = useBookmarks();
  const compare = useCompare();
  const bookmarked = bookmarks.has(listing.id);
  const inCompare = compare.has(listing.id);
  const reraVerified = isReraVerified(listing.reraVerificationStatus);
  const facts = propertyCardFacts(listing);

  function toggleCompare() {
    if (inCompare) {
      compare.remove(listing.id);
      return;
    }
    if (compare.isFull) {
      toast.info("Compare is full", { description: "Remove a property before adding another." });
      return;
    }
    compare.add(listing.id);
  }

  return (
    <Card
      className={cn(
        "flex h-[408px] flex-col gap-0 overflow-hidden pt-0",
        fluid ? "w-full" : "w-[280px] shrink-0 sm:w-[300px]",
      )}
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-loans-soft/50">
        <Link
          href={`/dashboard/properties/${listing.id}`}
          aria-label={`View ${listing.title}`}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
        >
          <ListingArtwork listing={listing} sizes="(min-width: 640px) 300px, 280px" />
          {reraVerified ? <ReraVerifiedCorner /> : null}
        </Link>

        <div className="absolute right-3 top-3 z-20 flex gap-2">
          <button
            type="button"
            onClick={() =>
              bookmarks.toggle(listing.id, {
                title: listing.title,
                locality: listing.locality,
                city: listing.city,
              })
            }
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this property"}
            aria-pressed={bookmarked}
            title={bookmarked ? "Remove bookmark" : "Bookmark this property"}
            className={cn(
              "grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-card/95 text-text-secondary shadow-sm ring-1 ring-border transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              bookmarked && "text-brand-cta",
            )}
          >
            <Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleCompare}
            aria-label={inCompare ? "Remove from compare" : "Add to compare"}
            aria-pressed={inCompare}
            title={inCompare ? "Remove from compare" : "Add to compare"}
            className={cn(
              "grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-card/95 text-text-secondary shadow-sm ring-1 ring-border transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              inCompare && "text-brand-cta",
            )}
          >
            <Scale className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <span className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5">
          <span className="rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-text-primary ring-1 ring-border">
            {listing.type}
          </span>
          {listing.listingIntent === "rent" ? (
            <span className="rounded-full bg-amber-100/95 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
              For rent
            </span>
          ) : null}
        </span>
      </div>

      <CardHeader className="gap-1.5 px-4 pb-0 pt-4">
        <CardTitle className="min-h-11 font-heading text-lg leading-snug text-foreground">
          <Link
            href={`/dashboard/properties/${listing.id}`}
            className="line-clamp-2 rounded-sm transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            {listing.title}
          </Link>
        </CardTitle>
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-text-secondary">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{listing.location}</span>
        </p>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3">
        {facts.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Property highlights">
            {facts.map((fact) => (
              <li
                key={fact}
                className="rounded-md bg-loans-soft px-2 py-1 text-xs font-medium text-text-secondary"
              >
                {fact}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-auto pt-3 font-heading text-xl font-semibold text-brand-blue">
          {listing.price}
        </p>
      </CardContent>

      <CardFooter className="px-4 pb-4 pt-0">
        <Link
          href={`/dashboard/properties/${listing.id}`}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
        >
          View details
        </Link>
      </CardFooter>
    </Card>
  );
}

export function PropertyMiniCard({ listing }: { listing: REListing }) {
  return (
    <Link
      href={`/dashboard/properties/${listing.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <div className="relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-loans-soft/50 lg:block">
        <ListingArtwork listing={listing} sizes="64px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text-primary">{listing.title}</p>
        <p className="truncate text-xs text-text-secondary">{listing.location}</p>
      </div>
      <p className="shrink-0 font-heading text-sm font-semibold text-brand-blue">{listing.price}</p>
    </Link>
  );
}

export function propertyCardFacts(listing: REListing): string[] {
  const facts: string[] = [];
  if (listing.bhk > 0) facts.push(`${listing.bhk} BHK`);
  if (listing.areaSqft > 0) {
    facts.push(`${new Intl.NumberFormat("en-IN").format(listing.areaSqft)} sq ft`);
  }

  const status = listing.constructionStatus ?? listing.status;
  if (status === "ready") facts.push("Ready");
  if (status === "under_construction") facts.push("Under construction");
  return facts.slice(0, 3);
}

function ListingArtwork({ listing, sizes }: { listing: REListing; sizes: string }) {
  const preferred = resolvePropertyArtwork(listing);
  const fallback = resolvePropertyArtwork({
    category: listing.category,
    propertySubtype: listing.propertySubtype,
  });
  const [src, setSrc] = React.useState(preferred.src);

  React.useEffect(() => setSrc(preferred.src), [preferred.src]);

  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      fill
      sizes={sizes}
      className="object-cover"
      onError={() => {
        if (src !== fallback.src) setSrc(fallback.src);
      }}
    />
  );
}

function ReraVerifiedCorner() {
  return (
    <span className="pointer-events-none absolute left-0 top-0 z-10 h-20 w-20 overflow-hidden">
      <span className="absolute -left-7 top-4 flex w-28 -rotate-45 items-center justify-center gap-1 bg-emerald-700 py-1 text-[10px] font-bold tracking-wide text-white shadow-sm">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
        RERA
      </span>
      <span className="sr-only">RERA verified</span>
    </span>
  );
}
