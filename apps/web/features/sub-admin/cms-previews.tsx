import React from "react";

import { AdStrip } from "@/components/ad-strip";
import { HeroCarousel } from "@/components/hero-carousel";
import {
  DashboardBannerCard,
  DashboardOfferCard,
} from "@/features/dashboard/personalized-placements";
import type { HeroBanner } from "@/lib/banners";
import type { Banner } from "@/lib/banners-api";
import type { Offer } from "@/lib/offers-api";
import type { AuthenticatedBanner, AuthenticatedOffer } from "@/lib/personalization-api";
import { isSafeLocalHref } from "@/lib/safe-local-href";

export type BannerPreviewValue = Pick<
  Banner,
  "banner_type" | "title" | "subtitle" | "cta_label" | "deep_link"
> & {
  image_url?: string | null;
  rera_verified?: boolean;
};
export type OfferPreviewValue = Pick<
  Offer,
  "title" | "description" | "discount_type" | "discount_value" | "code"
> &
  Partial<Pick<Offer, "partner_name" | "image_url" | "redemption_url" | "terms_summary">>;

export function BannerPreview({
  banner,
  context,
  placement,
}: {
  banner: BannerPreviewValue;
  context: "public" | "dashboard";
  placement?: Banner["placement"];
}) {
  const action = Boolean(
    banner.cta_label && banner.deep_link && isSafeLocalHref(banner.deep_link),
  );
  if (context === "dashboard") {
    const value: AuthenticatedBanner = {
      id: "campaign-preview",
      banner_type: banner.banner_type,
      title: banner.title || "Banner title",
      subtitle: banner.subtitle ?? null,
      cta_label: action ? banner.cta_label! : null,
      deep_link: action ? banner.deep_link! : null,
      image_url: banner.image_url ?? null,
    };
    return (
      <DashboardScene>
        <DashboardBannerCard banner={value} interactive={false} />
      </DashboardScene>
    );
  }

  const value: HeroBanner = {
    id: "campaign-preview",
    title: banner.title || "Banner title",
    subtitle: banner.subtitle || undefined,
    image: banner.image_url || undefined,
    reraVerified: banner.rera_verified,
    cta: action ? { label: banner.cta_label!, href: banner.deep_link! } : undefined,
  };
  if (placement === "homepage_ad") {
    return (
      <PublicScene label="Homepage sponsor">
        <AdStrip banner={value} dismissible={false} />
      </PublicScene>
    );
  }
  return (
    <PublicScene label={placementLabel(placement)}>
      <HeroCarousel
        banners={[value]}
        variant={placement === "homepage" || placement === undefined ? "hero" : "section"}
        label="Campaign preview"
        interactive={false}
      />
    </PublicScene>
  );
}

export function OfferPreview({ offer }: { offer: OfferPreviewValue }) {
  const value: AuthenticatedOffer = {
    id: "offer-preview",
    title: offer.title || "Offer title",
    description: offer.description ?? null,
    discount_type: offer.discount_type,
    discount_value: offer.discount_value,
    code: offer.code ?? "OFFER",
    partner_name: offer.partner_name ?? "Partner",
    image_url: offer.image_url ?? "",
    redemption_url: offer.redemption_url ?? "https://partner.example",
    terms_summary:
      offer.terms_summary ?? "Offer terms appear here before a customer proceeds.",
    terms_url: null,
  };
  return (
    <DashboardScene>
      <div className="max-w-md">
        <DashboardOfferCard offer={value} interactive={false} />
      </div>
    </DashboardScene>
  );
}

function PublicScene({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#f7f2e8] shadow-sm">
      <div className="flex h-11 items-center justify-between border-b border-black/10 bg-[var(--nav-bg)] px-4">
        <span className="font-heading text-sm font-semibold text-[var(--nav-text)]">DhanaDhara</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--nav-text)]/70">
          {label}
        </span>
        <span className="rounded-full bg-[var(--nav-primary)] px-2.5 py-1 text-[10px] font-semibold text-white">
          Login
        </span>
      </div>
      <div className="pointer-events-none">{children}</div>
      <div className="grid grid-cols-3 gap-2 p-3" aria-hidden="true">
        <span className="h-9 rounded-lg bg-white/80" />
        <span className="h-9 rounded-lg bg-white/80" />
        <span className="h-9 rounded-lg bg-white/80" />
      </div>
    </div>
  );
}

function DashboardScene({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="flex h-11 items-center justify-between border-b border-border bg-card px-4">
        <span className="font-heading text-sm font-semibold">DhanaDhara dashboard</span>
        <span className="h-7 w-7 rounded-full bg-[var(--nav-tint)]" />
      </div>
      <div className="grid min-h-64 grid-cols-[3.5rem_minmax(0,1fr)]">
        <aside className="space-y-2 border-r border-border bg-card p-2" aria-hidden="true">
          <span className="block h-8 rounded-lg bg-[var(--nav-tint)]" />
          <span className="block h-8 rounded-lg bg-muted" />
          <span className="block h-8 rounded-lg bg-muted" />
        </aside>
        <main className="pointer-events-none space-y-3 p-3">
          <div className="flex justify-between">
            <span className="h-5 w-28 rounded bg-muted" />
            <span className="h-7 w-20 rounded bg-muted" />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function placementLabel(placement?: Banner["placement"]): string {
  if (placement === "financial_services") return "Financial services page";
  if (placement === "properties") return "Properties page";
  return "Homepage hero";
}
