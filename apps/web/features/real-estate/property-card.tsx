"use client";

import Image from "next/image";
import Link from "next/link";
import { Bookmark, CalendarCheck, Check, MapPin, Scale } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyActionDialog } from "@/features/real-estate/property-action-dialog";
import { PropertyMediaDialog } from "@/components/property-media-dialog";
import { PropertyDetailsDialog } from "@/components/property-details-dialog";
import { useBookmarks, useCompare } from "@/features/real-estate/store";
import type { REListing } from "@/lib/real-estate";
import { isReraVerified, resolvePropertyArtwork } from "@/lib/property-artwork";
import { cn } from "@/lib/utils";

// One predictable card template is used by category rails and result grids.
// Generated artwork is render-only fallback: approved property media keeps
// priority and no fallback is ever represented as an uploaded photo.
export function PropertyCard({ listing, fluid = false }: { listing: REListing; fluid?: boolean }) {
  const bookmarks = useBookmarks();
  const compare = useCompare();
  const bookmarked = bookmarks.has(listing.id);
  const inCompare = compare.has(listing.id);
  const artwork = resolvePropertyArtwork(listing);
  const reraVerified = isReraVerified(listing.reraVerificationStatus);

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
        "flex h-full min-h-[542px] flex-col gap-0 overflow-hidden pt-0",
        fluid ? "w-full" : "w-[280px] shrink-0 sm:w-[300px]",
      )}
    >
      <Link
        href={`/dashboard/properties/${listing.id}`}
        aria-label={`View ${listing.title}`}
        className="relative aspect-[4/3] w-full bg-loans-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
      >
        <Image src={artwork.src} alt="" aria-hidden fill sizes="300px" className="object-cover" />
        {artwork.isFallback ? (
          <span className="pointer-events-none absolute right-3 top-3 rounded border border-white/60 bg-card/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary shadow-sm">
            Property preview
          </span>
        ) : null}
        {reraVerified ? <ReraVerifiedCorner /> : null}
        <span className="absolute bottom-3 left-3 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-text-primary ring-1 ring-border">
          {listing.type}
        </span>
      </Link>

      <CardHeader className="flex min-h-[176px] flex-1 gap-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="font-heading text-lg text-foreground">
            <Link
              href={`/dashboard/properties/${listing.id}`}
              className="line-clamp-2 rounded-sm hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {listing.title}
            </Link>
          </CardTitle>
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
            className={cn(
              "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              bookmarked ? "text-brand-cta" : "text-text-secondary",
            )}
          >
            <Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} aria-hidden="true" />
          </button>
        </div>
        <p className="flex min-h-5 items-center gap-1.5 text-sm text-text-secondary">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">{listing.location}</span>
        </p>
        <p className="min-h-5 line-clamp-1 text-sm text-text-secondary">{listing.meta ?? "\u00a0"}</p>
        <p className="min-h-4 text-xs text-text-secondary">
          {reraVerified && listing.reraNumber ? `RERA · ${listing.reraNumber}` : "\u00a0"}
        </p>
      </CardHeader>

      <CardContent className="pt-1">
        <p className="font-heading text-xl font-semibold text-brand-blue">{listing.price}</p>
      </CardContent>

      <CardFooter className="mt-auto flex min-h-[190px] flex-col gap-2 pt-5">
        <PropertyDetailsDialog title={listing.title} details={listing.structuredDetails} />
        {listing.media?.length ? <PropertyMediaDialog title={listing.title} media={listing.media} /> : null}
        <div className="flex w-full gap-2">
          <PropertyActionDialog
            variant="enquire"
            listing={listing}
            trigger={
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-brand-cta hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                Enquire
              </button>
            }
          />
          <PropertyActionDialog
            variant="site-visit"
            listing={listing}
            trigger={
              <button
                type="button"
                aria-label="Book a site visit"
                className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-border text-text-secondary transition-colors hover:border-brand-cta hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              </button>
            }
          />
        </div>
        <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={inCompare}
            onChange={toggleCompare}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border text-brand-cta focus-visible:outline-none"
          />
          <Scale className="h-3.5 w-3.5" aria-hidden="true" />
          Add to compare
        </label>
      </CardFooter>
    </Card>
  );
}

export function PropertyMiniCard({ listing }: { listing: REListing }) {
  const artwork = resolvePropertyArtwork(listing);
  return (
    <Link
      href={`/dashboard/properties/${listing.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <div className="relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-loans-soft/50 lg:block">
        <Image src={artwork.src} alt="" aria-hidden fill sizes="64px" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text-primary">{listing.title}</p>
        <p className="truncate text-xs text-text-secondary">{listing.location}</p>
      </div>
      <p className="shrink-0 font-heading text-sm font-semibold text-brand-blue">{listing.price}</p>
    </Link>
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
