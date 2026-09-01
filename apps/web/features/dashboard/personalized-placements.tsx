"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Copy, ExternalLink } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import {
  listAuthenticatedPlacements,
  type AuthenticatedBanner,
  type AuthenticatedOffer,
  type AuthenticatedPlacement,
} from "@/lib/personalization-api";
import { isSafeLocalHref } from "@/lib/safe-local-href";

import { DASHBOARD_ICONS } from "./dashboard-icons";

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

export function PersonalizedPlacements({
  businessLine,
  showBanners = true,
}: {
  businessLine: BusinessLine;
  showBanners?: boolean;
}) {
  const { session } = useAuth();
  const [placement, setPlacement] = React.useState<AuthenticatedPlacement | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setPlacement(null);
    void (async () => {
      const result = await listAuthenticatedPlacements(businessLine);
      if (!active) return;
      setPlacement(result.ok ? result.data : null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [businessLine]);

  if (loading) {
    return <div className="mx-auto mb-6 w-full max-w-[1440px] px-4 sm:px-6 lg:px-8"><Skeleton className="h-36 rounded-2xl" /></div>;
  }

  const banners = showBanners
    ? placement?.banners.length
      ? placement.banners
      : [fallbackBanner(session?.role ?? "client", businessLine)]
    : [];
  const offers = placement?.offers ?? [];
  if (!banners.length && !offers.length) return null;

  return (
    <section aria-label="Dashboard highlights" className="mx-auto mb-6 w-full max-w-[1440px] space-y-3 px-4 sm:px-6 lg:px-8">
      {banners.map((banner) => <DashboardBannerCard key={banner.id} banner={banner} />)}
      {offers.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Offers for you">{offers.map((offer) => <DashboardOfferCard key={offer.id} offer={offer} />)}</div> : null}
    </section>
  );
}

export function DashboardOfferCard({ offer, interactive = true }: { offer: AuthenticatedOffer; interactive?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const imageUrl = isAllowedAssetUrl(offer.image_url) ? offer.image_url : null;

  async function copyCode() {
    if (!offer.code) return;
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative aspect-[16/7] bg-[var(--nav-tint)]">{imageUrl ? <Image src={imageUrl} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" /> : null}</div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--nav-primary)]"><DASHBOARD_ICONS.offers className="h-4 w-4" aria-hidden="true" />{offer.partner_name}</span>
          <Badge variant="secondary">{offer.discount_type === "percentage" ? `${offer.discount_value}% off` : offer.discount_type === "cashback-tie" ? "Cashback" : `₹${offer.discount_value} off`}</Badge>
        </div>
        <h2 className="font-semibold text-text-primary">{offer.title}</h2>
        {offer.description ? <p className="text-sm text-text-secondary">{offer.description}</p> : null}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2">
          <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-text-secondary">Coupon code</p><code className="block truncate text-sm font-semibold text-text-primary">{offer.code}</code></div>
          <Button type="button" variant="ghost" size="sm" disabled={!interactive} onClick={() => void copyCode()} aria-live="polite">{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? "Copied" : "Copy"}</Button>
        </div>
        <p className="text-xs leading-5 text-text-secondary">Copy the code, open the partner checkout, and enter it before payment. Dhanadhara does not apply or track redemption.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild={interactive} disabled={!interactive} size="sm">{interactive ? <a href={offer.redemption_url} target="_blank" rel="noopener noreferrer">Use offer<ExternalLink className="h-4 w-4" aria-hidden="true" /></a> : <>Use offer<ExternalLink className="h-4 w-4" aria-hidden="true" /></>}</Button>
          {offer.terms_url ? interactive ? <a href={offer.terms_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[var(--nav-primary)] underline-offset-4 hover:underline">Full terms</a> : <span className="text-xs font-medium text-[var(--nav-primary)]">Full terms</span> : null}
        </div>
        <p className="text-xs text-text-secondary">{offer.terms_summary}</p>
      </div>
    </article>
  );
}

export function DashboardBannerCard({ banner, interactive = true }: { banner: AuthenticatedBanner; interactive?: boolean }) {
  const hasImage = Boolean(banner.image_url && isAllowedAssetUrl(banner.image_url));
  const hasAction = Boolean(banner.cta_label && banner.deep_link && isSafeLocalHref(banner.deep_link));
  return (
    <article className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-navy to-blue-700 p-6 text-white shadow-sm" style={hasImage ? { backgroundImage: `linear-gradient(90deg, rgba(14,35,70,.94), rgba(29,78,216,.72)), url(${JSON.stringify(banner.image_url)})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
      {banner.banner_type === "action" ? <Badge className="mb-3 bg-white/15 text-white hover:bg-white/15">Next step</Badge> : null}
      <h2 className="max-w-2xl text-xl font-semibold sm:text-2xl">{banner.title}</h2>
      {banner.subtitle ? <p className="mt-2 max-w-2xl text-sm text-blue-100">{banner.subtitle}</p> : null}
      {hasAction ? interactive ? <Link href={banner.deep_link!} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-blue-50">{banner.cta_label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link> : <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-navy">{banner.cta_label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span> : null}
    </article>
  );
}
