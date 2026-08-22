import Image from "next/image";
import { MapPin } from "lucide-react";

import { LeadDialog } from "@/components/lead-dialog";
import { PropertyMediaDialog } from "@/components/property-media-dialog";
import { PropertyDetailsDialog } from "@/components/property-details-dialog";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { contactHref } from "@/lib/leads";
import type { PropertyListing } from "@/lib/properties";

// A single placeholder property card for the Properties catalog rows. Mirrors
// the product-card visual system in components/product-page.tsx: an image band
// on top, copy in the middle, a LeadDialog "Enquire" in the footer. Until real
// photos exist, the band is a cream placeholder tagged "Sample" (same treatment
// as the hero-carousel banner placeholder). Server Component; the only island is
// the LeadDialog, which is its own client component.
//
// Fixed width so the card sits inside the horizontal-scroll PropertyRow.

export function PropertyCard({ listing }: { listing: PropertyListing }) {
  return (
    <Card className="flex h-full w-[280px] shrink-0 flex-col gap-0 overflow-hidden pt-0 sm:w-[300px]">
      <div className="relative aspect-[4/3] w-full bg-[var(--nav-tint)]/50">
        {listing.image ? (
          <Image
            src={listing.image}
            alt=""
            aria-hidden
            fill
            sizes="300px"
            className="object-cover"
          />
        ) : (
          <span className="pointer-events-none absolute right-3 top-3 rounded border border-dashed border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Sample
          </span>
        )}
        <span className="absolute bottom-3 left-3 rounded-full bg-[var(--nav-bg)]/90 px-2.5 py-1 text-xs font-medium text-[var(--nav-text)] ring-1 ring-[var(--nav-border)]">
          {listing.type}
        </span>
      </div>

      <CardHeader className="flex-1 gap-2 pt-6">
        <CardTitle className="font-heading text-lg text-foreground">
          {listing.title}
        </CardTitle>
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {listing.location}
        </p>
        {listing.meta ? (
          <p className="text-sm text-text-secondary">{listing.meta}</p>
        ) : null}
        {listing.reraNumber && listing.reraVerificationStatus === "verified" ? (
          <p className="text-xs text-muted-foreground">RERA verified · {listing.reraNumber}</p>
        ) : null}
      </CardHeader>

      <CardContent className="pt-1">
        <p className="font-heading text-xl font-semibold text-brand-blue">
          {listing.price}
        </p>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 pt-5">
        <PropertyDetailsDialog title={listing.title} details={listing.structuredDetails} />
        {listing.media?.length ? (
          <PropertyMediaDialog title={listing.title} media={listing.media} />
        ) : null}
        <LeadDialog
          businessLine="real_estate"
          product={`${listing.title}, ${listing.location}`}
          triggerLabel="Enquire"
          triggerVariant="outline"
          href={contactHref({
            line: "real_estate",
            product: `${listing.title}, ${listing.location}`,
          })}
        />
      </CardFooter>
    </Card>
  );
}
