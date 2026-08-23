"use client";

import * as React from "react";
import Link from "next/link";

import { PropertyDetailView } from "@/components/property-detail-view";
import type { SimilarPropertyCardData } from "@/components/similar-properties-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/dashboard/me-provider";
import { PropertyDetailActions } from "@/features/real-estate/property-detail-actions";
import { useProperties } from "@/features/real-estate/use-properties";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { formatNumber } from "@/lib/format";
import { getProperty } from "@/lib/properties-api";
import { rankSimilarProperties } from "@/lib/similar-properties";
import type { REListing } from "@/lib/real-estate";

export function DashboardPropertyDetail({ propertyId }: { propertyId: string }) {
  const { me } = useMe();
  const [listing, setListing] = React.useState<REListing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  // Independent catalogue fetch for the similar-properties rail. Deliberately
  // not folded into the effect below and deliberately not surfacing its own
  // loading/error state: a recommendation panel must never gate or break the
  // primary detail render. Loading -> the panel just isn't there yet; error
  // -> it stays absent. Both are silent by design.
  const { listings: catalogue } = useProperties();

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getProperty(propertyId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setListing(result.data);
      } else {
        setListing(null);
        setError(
          result.status === 404
            ? "This property is no longer available."
            : result.error || "Property details could not be loaded.",
        );
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [propertyId, reloadKey]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="aspect-[16/10] w-full rounded-2xl sm:aspect-[2/1]" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-heading text-3xl font-semibold text-foreground">Property unavailable</h1>
        <p className="mt-3 text-text-secondary">{error}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/explore">Back to Explore</Link>
          </Button>
        </div>
      </div>
    );
  }

  const hasRealEstateProfile =
    me?.profiles.some((profile) => profile.businessLine === "real_estate") ?? false;

  const similar: SimilarPropertyCardData[] = rankSimilarProperties(listing, catalogue).map(
    ({ listing: item, reason }) => {
      // mapProperty (lib/properties-api.ts) does not filter media hosts the
      // way the public catalogue client does, so an unallowlisted host would
      // otherwise throw inside next/image here.
      const image = item.image && isAllowedAssetUrl(item.image) ? item.image : undefined;
      return {
        id: item.id,
        href: `/dashboard/properties/${item.id}`,
        title: item.title,
        address: item.location,
        ...(reason ? { proximity: reason } : {}),
        price: item.price,
        ...(item.areaSqft > 0 ? { area: `${formatNumber(item.areaSqft)} sq ft` } : {}),
        ...(image ? { image } : {}),
        type: item.type,
      };
    },
  );
  const similarCta = {
    href: `/dashboard/explore/${listing.category}?city=${encodeURIComponent(listing.city)}`,
    label: `More properties in ${listing.city}`,
  };

  return (
    <PropertyDetailView
      listing={{
        ...listing,
        constructionStatus: listing.constructionStatus ?? listing.status,
        reraApplicability: listing.reraApplicability ?? "unsure",
      }}
      backHref="/dashboard/explore"
      backLabel="Back to Explore"
      dashboard
      similar={similar}
      similarCta={similarCta}
      actions={
        <PropertyDetailActions
          listing={listing}
          hasRealEstateProfile={hasRealEstateProfile}
        />
      }
    />
  );
}
