"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { PropertyDetailGallery } from "@/components/property-detail-gallery";
import { PropertyDetailsSummary } from "@/components/property-details-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { WorkspaceDialogHeader } from "@/features/dashboard/workspace-dialog";
import { formatPaise } from "@/lib/format";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import type { REListing } from "@/lib/real-estate";

function allowedPreviewImage(url: string) {
  return isAllowedAssetUrl(url) || /^\/illustrations\/[a-zA-Z0-9/_-]+\.(?:svg|png|jpe?g|webp|avif)$/.test(url);
}

export function PropertyPreviewDialog({ listing }: { listing: REListing }) {
  const facts = [
    ["Property type", listing.propertySubtype?.replaceAll("_", " ") ?? listing.type],
    ["Configuration", listing.bhk > 0 ? `${listing.bhk} BHK` : null],
    ["Area", listing.areaSqft > 0 ? `${listing.areaSqft.toLocaleString("en-IN")} sq ft` : null],
    ["Furnishing", listing.furnishing ? { furnished: "Furnished", semi: "Semi furnished", unfurnished: "Unfurnished" }[listing.furnishing] : null],
    ["Construction", (listing.constructionStatus ?? listing.status)?.replaceAll("_", " ")],
    ["Location", [listing.locality, listing.city, listing.state, listing.pincode].filter(Boolean).join(", ")],
    ["RERA", listing.reraNumber ?? (listing.reraVerificationStatus === "exemption_verified" ? "Exemption reviewed" : "Not provided")],
    ["RERA review", listing.reraVerificationStatus?.replaceAll("_", " ")],
    ["Security deposit", listing.securityDepositPaise == null ? null : formatPaise(listing.securityDepositPaise)],
    ["Minimum lease", listing.minimumLeaseMonths ? `${listing.minimumLeaseMonths} months` : null],
    ["Available from", listing.availableFrom],
  ].filter(([, value]) => value);
  return <Dialog>
    <DialogTrigger asChild><Button className="w-full">View details</Button></DialogTrigger>
    <DialogContent showCloseButton={false} className="flex max-h-[90dvh] w-[calc(100%-2rem)] !max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl !p-0">
      <div className="shrink-0 px-5 pt-5 sm:px-7 sm:pt-6"><WorkspaceDialogHeader title={listing.title} description="Property overview" closeLabel="Close property details" /></div>
      <div className="min-h-0 space-y-7 overflow-y-auto p-5 sm:p-7">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <PropertyDetailGallery title={listing.title} image={listing.image && allowedPreviewImage(listing.image) ? listing.image : undefined} media={listing.media?.filter((item) => allowedPreviewImage(item.url))} />
          <div className="min-w-0 self-center">
            <p className="text-sm font-medium text-text-secondary">{listing.listingIntent === "rent" ? "For rent / lease" : "For sale"} · {listing.type}</p>
            <p className="mt-3 break-words text-3xl font-semibold tracking-tight text-brand-link">{listing.price}</p>
            <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-text-secondary"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden />{listing.location}</p>
            {listing.meta ? <p className="mt-4 text-sm leading-6 text-text-secondary">{listing.meta}</p> : null}
          </div>
        </div>
        <section><h3 className="mb-4 text-base font-semibold">At a glance</h3><dl className="grid gap-x-6 gap-y-4 rounded-xl bg-muted/40 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 break-words font-medium capitalize">{value}</dd></div>)}</dl></section>
        {listing.structuredDetails ? <section className="border-t border-border pt-6"><h3 className="mb-5 text-base font-semibold">Specifications & project details</h3><PropertyDetailsSummary details={listing.structuredDetails} /></section> : null}
        {listing.amenities.length ? <section className="border-t border-border pt-6"><h3 className="mb-3 text-base font-semibold">Amenities</h3><ul className="flex flex-wrap gap-2">{listing.amenities.map((item) => <li key={item} className="rounded-md bg-muted px-3 py-1.5 text-sm capitalize">{item.replaceAll("_", " ")}</li>)}</ul></section> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:px-7"><p className="text-xs text-text-secondary">Explore photos, enquiries and site visits on the full listing.</p><Button asChild><Link href={`/dashboard/properties/${listing.id}`}>Open full listing<ArrowUpRight className="h-4 w-4" aria-hidden /></Link></Button></div>
    </DialogContent>
  </Dialog>;
}
