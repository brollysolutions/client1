"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgePercent } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import {
  listAuthenticatedPlacements,
  type AuthenticatedBanner,
  type AuthenticatedPlacement,
} from "@/lib/personalization-api";
import { isSafeLocalHref } from "@/lib/safe-local-href";

type BusinessLine = "loans" | "real_estate";

function fallbackBanner(role: string, line: BusinessLine): AuthenticatedBanner {
  const agent = role === "agent";
  return {
    id: `fallback-${role}-${line}`,
    banner_type: "default",
    title: agent
      ? line === "loans"
        ? "Turn every conversation into progress"
        : "Help buyers find the right property"
      : line === "loans"
        ? "Your financial journey, in one place"
        : "Your property journey starts here",
    subtitle: agent
      ? "Keep your active work moving from your dashboard."
      : "Track each next step securely from your dashboard.",
    cta_label: null,
    deep_link: null,
    image_url: null,
  };
}

export function PersonalizedPlacements({ businessLine }: { businessLine: BusinessLine }) {
  const { session } = useAuth();
  const [placement, setPlacement] = React.useState<AuthenticatedPlacement | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      const result = await listAuthenticatedPlacements(businessLine);
      if (!active) return;
      if (result.ok) setPlacement(result.data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [businessLine]);

  if (loading) {
    return (
      <div className="mx-auto mb-6 w-full max-w-5xl space-y-3 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  }

  const banners = placement?.banners.length
    ? placement.banners
    : [fallbackBanner(session?.role ?? "client", businessLine)];
  const offers = placement?.offers ?? [];

  return (
    <section
      aria-label="Dashboard highlights"
      className="mx-auto mb-6 w-full max-w-5xl space-y-3 px-4 sm:px-6 lg:px-10"
    >
      {banners.map((banner) => (
        <DashboardBanner key={banner.id} banner={banner} />
      ))}
      {offers.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Offers for you">
          {offers.map((offer) => (
            <article key={offer.id} className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 text-blue-800">
                <BadgePercent className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide">Offer</span>
              </div>
              <h2 className="mt-2 font-semibold text-text-primary">{offer.title}</h2>
              {offer.description ? (
                <p className="mt-1 text-sm text-text-secondary">{offer.description}</p>
              ) : null}
              <p className="mt-3 text-sm font-semibold text-blue-800">
                {offer.discount_type === "percentage" ? `${offer.discount_value}% off` : `₹${offer.discount_value}`}
                {offer.code ? ` · Code ${offer.code}` : ""}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DashboardBanner({ banner }: { banner: AuthenticatedBanner }) {
  const hasImage = Boolean(banner.image_url && isAllowedAssetUrl(banner.image_url));
  const hasAction = Boolean(
    banner.cta_label && banner.deep_link && isSafeLocalHref(banner.deep_link),
  );
  return (
    <article
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-navy to-blue-700 p-6 text-white shadow-sm"
      style={
        hasImage
          ? {
              backgroundImage: `linear-gradient(90deg, rgba(14,35,70,.94), rgba(29,78,216,.72)), url(${JSON.stringify(banner.image_url)})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }
          : undefined
      }
    >
      {banner.banner_type === "action" ? (
        <Badge className="mb-3 bg-white/15 text-white hover:bg-white/15">Next step</Badge>
      ) : null}
      <h2 className="max-w-2xl text-xl font-semibold sm:text-2xl">{banner.title}</h2>
      {banner.subtitle ? <p className="mt-2 max-w-2xl text-sm text-blue-100">{banner.subtitle}</p> : null}
      {hasAction ? (
        <Link
          href={banner.deep_link!}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-blue-50"
        >
          {banner.cta_label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}
