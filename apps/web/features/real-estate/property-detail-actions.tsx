"use client";

import Link from "next/link";
import { Bookmark, CalendarCheck, MessageCircle, PhoneCall, Scale } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PropertyActionDialog } from "@/features/real-estate/property-action-dialog";
import { useBookmarks, useCompare } from "@/features/real-estate/store";
import { contactHref } from "@/lib/leads";
import type { REListing } from "@/lib/real-estate";
import { cn } from "@/lib/utils";

export function PropertyDetailActions({
  listing,
  hasRealEstateProfile,
}: {
  listing: REListing;
  hasRealEstateProfile: boolean;
}) {
  const bookmarks = useBookmarks();
  const compare = useCompare();
  const bookmarked = bookmarks.has(listing.id);
  const compared = compare.has(listing.id);

  if (!hasRealEstateProfile) {
    return (
      <>
        <Button asChild className="min-h-11 w-full">
          <Link
            href={contactHref({
              line: "real_estate",
              product: `${listing.title}, ${listing.location}`,
              propertyRef: listing.id,
            })}
          >
            <PhoneCall className="h-4 w-4" aria-hidden />
            Contact team
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 w-full">
          <Link href={`/real-estate/properties/${listing.id}`}>View public page</Link>
        </Button>
      </>
    );
  }

  function toggleCompare() {
    if (compared) {
      compare.remove(listing.id);
      return;
    }
    if (compare.isFull) {
      toast.info("Compare is full", {
        description: "Remove a property before adding another.",
      });
      return;
    }
    compare.add(listing.id);
  }

  return (
    <>
      <PropertyActionDialog
        variant="enquire"
        listing={listing}
        trigger={
          <Button type="button" className="min-h-11 w-full">
            <MessageCircle className="h-4 w-4" aria-hidden />
            Enquire
          </Button>
        }
      />
      <PropertyActionDialog
        variant="site-visit"
        listing={listing}
        trigger={
          <Button type="button" variant="outline" className="min-h-11 w-full">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Book a visit
          </Button>
        }
      />
      <Button
        type="button"
        variant="outline"
        aria-pressed={bookmarked}
        onClick={() =>
          bookmarks.toggle(listing.id, {
            title: listing.title,
            locality: listing.locality,
            city: listing.city,
          })
        }
        className={cn("min-h-11 w-full", bookmarked && "border-brand-cta text-brand-cta")}
      >
        <Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} aria-hidden />
        {bookmarked ? "Saved" : "Save"}
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-pressed={compared}
        onClick={toggleCompare}
        className={cn("min-h-11 w-full", compared && "border-brand-cta text-brand-cta")}
      >
        <Scale className="h-4 w-4" aria-hidden />
        {compared ? "In compare" : "Compare"}
      </Button>
    </>
  );
}
