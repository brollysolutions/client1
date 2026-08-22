import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  Hammer,
  MapPin,
  Ruler,
  ShieldCheck,
  Sofa,
} from "lucide-react";

import { PanoramaViewer } from "@/components/panorama-viewer";
import { PropertyDetailGallery } from "@/components/property-detail-gallery";
import { PropertyDetailsSummary } from "@/components/property-details-dialog";
import type { PropertyDetailListing } from "@/lib/properties";

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type Fact = {
  label: string;
  value: string;
  icon: typeof BedDouble;
};

export function PropertyDetailView({
  listing,
  backHref,
  backLabel,
  actions,
  dashboard = false,
}: {
  listing: PropertyDetailListing;
  backHref: string;
  backLabel: string;
  actions: React.ReactNode;
  dashboard?: boolean;
}) {
  const facts: Fact[] = [
    ...(listing.bhk > 0
      ? [{ label: "Configuration", value: `${listing.bhk} BHK`, icon: BedDouble }]
      : []),
    ...(listing.areaSqft > 0
      ? [
          {
            label: "Area",
            value: `${listing.areaSqft.toLocaleString("en-IN")} sq ft`,
            icon: Ruler,
          },
        ]
      : []),
    ...(listing.furnishing
      ? [{ label: "Furnishing", value: humanize(listing.furnishing), icon: Sofa }]
      : []),
    ...(listing.constructionStatus
      ? [
          {
            label: "Construction",
            value: humanize(listing.constructionStatus),
            icon: Hammer,
          },
        ]
      : []),
    ...(listing.ageYears > 0
      ? [
          {
            label: "Property age",
            value: `${listing.ageYears} ${listing.ageYears === 1 ? "year" : "years"}`,
            icon: CalendarDays,
          },
        ]
      : []),
  ];
  const panoramas = listing.media?.filter((item) => item.kind === "panorama") ?? [];

  return (
    <div
      className={
        dashboard
          ? "min-h-full bg-background pb-28 lg:pb-12"
          : "min-h-screen bg-[var(--nav-bg)] pb-28 lg:pb-16"
      }
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-text-secondary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>

        <div className="mt-3">
          <PropertyDetailGallery title={listing.title} image={listing.image} media={listing.media} />
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
          <article className="min-w-0 space-y-8">
            <header className="border-b border-border pb-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--nav-tint)] px-3 py-1 text-xs font-semibold text-[var(--nav-primary)]">
                  {listing.type}
                </span>
                {listing.reraNumber && listing.reraVerificationStatus === "verified" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    RERA verified
                  </span>
                ) : null}
              </div>
              <h1 className="mt-4 max-w-4xl font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                {listing.title}
              </h1>
              <p className="mt-3 flex items-start gap-2 text-base text-text-secondary sm:text-lg">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                {listing.location}
              </p>
              <p className="mt-5 font-heading text-3xl font-semibold text-[var(--nav-primary)]">
                {listing.price}
              </p>
              {listing.meta ? (
                <p className="mt-2 text-sm text-text-secondary">{listing.meta}</p>
              ) : null}
            </header>

            {facts.length > 0 ? (
              <section aria-labelledby="quick-facts-heading">
                <h2 id="quick-facts-heading" className="font-heading text-2xl font-semibold text-foreground">
                  Property at a glance
                </h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {facts.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-2xl border border-border bg-card p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                        <Icon className="h-4 w-4 text-[var(--nav-primary)]" aria-hidden />
                        {label}
                      </dt>
                      <dd className="mt-2 font-semibold text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <section aria-labelledby="details-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--nav-tint)] text-[var(--nav-primary)]">
                  <Building2 className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 id="details-heading" className="font-heading text-2xl font-semibold text-foreground">
                    Property details
                  </h2>
                  <p className="text-sm text-text-secondary">Admin-approved facts for this listing.</p>
                </div>
              </div>
              <PropertyDetailsSummary details={listing.structuredDetails} />
            </section>

            {listing.amenities.length > 0 ? (
              <section aria-labelledby="amenities-heading">
                <h2 id="amenities-heading" className="font-heading text-2xl font-semibold text-foreground">
                  Amenities
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {listing.amenities.map((amenity) => (
                    <li key={amenity} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                      {humanize(amenity)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {panoramas.length > 0 ? (
              <section aria-labelledby="panorama-heading" className="space-y-4">
                <div>
                  <h2 id="panorama-heading" className="font-heading text-2xl font-semibold text-foreground">
                    360 degree view
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">Drag the image to look around the property.</p>
                </div>
                {panoramas.map((panorama, index) => (
                  <PanoramaViewer key={panorama.url} src={panorama.url} title={`${listing.title} panorama ${index + 1}`} />
                ))}
              </section>
            ) : null}

            <section aria-labelledby="trust-heading" className="rounded-2xl border border-[var(--nav-border)] bg-[var(--nav-tint)] p-5 sm:p-6">
              <h2 id="trust-heading" className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
                <ShieldCheck className="h-5 w-5 text-[var(--nav-primary)]" aria-hidden />
                Listing checks
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                This property is visible because a Dhanadhara Admin approved it for the catalog. Our team can help you verify documents, arrange a visit, and understand the next steps before you decide.
              </p>
              {listing.reraNumber && listing.reraVerificationStatus === "verified" ? (
                <p className="mt-3 text-sm font-medium text-foreground">
                  RERA registration: {listing.reraNumber}
                </p>
              ) : listing.reraVerificationStatus === "exemption_verified" ? (
                <p className="mt-3 text-sm font-medium text-foreground">RERA exemption reviewed by Admin.</p>
              ) : null}
            </section>
          </article>

          <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur lg:sticky lg:top-24 lg:z-10 lg:rounded-2xl lg:border lg:p-6 lg:shadow-sm">
            <div className="hidden lg:block">
              <p className="text-sm font-medium text-text-secondary">Interested in this property?</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-foreground">{listing.price}</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">Connect with Dhanadhara for verified next steps and a guided visit.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:mt-5 lg:grid-cols-1 lg:gap-3">{actions}</div>
            <p className="mt-4 hidden text-xs leading-5 text-text-secondary lg:block">No payment is required to ask about this property. Final availability and terms are confirmed by our team.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
