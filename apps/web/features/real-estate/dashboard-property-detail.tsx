"use client";

import * as React from "react";
import Link from "next/link";

import { PropertyDetailView } from "@/components/property-detail-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/dashboard/me-provider";
import { PropertyDetailActions } from "@/features/real-estate/property-detail-actions";
import { getProperty } from "@/lib/properties-api";
import type { REListing } from "@/lib/real-estate";

export function DashboardPropertyDetail({ propertyId }: { propertyId: string }) {
  const { me } = useMe();
  const [listing, setListing] = React.useState<REListing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

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
      actions={
        <PropertyDetailActions
          listing={listing}
          hasRealEstateProfile={hasRealEstateProfile}
        />
      }
    />
  );
}
