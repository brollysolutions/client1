import React from "react";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { AdStrip } from "@/components/ad-strip";
import { Badge } from "@/components/ui/badge";
import type { HeroBanner } from "@/lib/banners";
import type { Banner } from "@/lib/banners-api";
import type { Offer } from "@/lib/offers-api";
import { isSafeLocalHref } from "@/lib/safe-local-href";
import { cn } from "@/lib/utils";

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
  Partial<
    Pick<
      Offer,
      "partner_name" | "image_url" | "redemption_url" | "terms_summary"
    >
  >;

function decimalText(value: string): string {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

function offerDiscount(offer: OfferPreviewValue): string {
  const value = decimalText(offer.discount_value);
  if (offer.discount_type === "percentage") return `${value}% off`;
  if (offer.discount_type === "cashback-tie") return "Cashback offer";
  return `₹${value} off`;
}

export function BannerPreview({
  banner,
  context,
  placement,
}: {
  banner: BannerPreviewValue;
  context: "public" | "dashboard";
  placement?: Banner["placement"];
}) {
  const action = Boolean(banner.cta_label && banner.deep_link && isSafeLocalHref(banner.deep_link));
  if (context === "dashboard") {
    return (
      <article className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-navy to-blue-700 p-6 text-white shadow-sm">
        {banner.banner_type === "action" ? <Badge className="mb-3 bg-white/15 text-white hover:bg-white/15">Next step</Badge> : null}
        <h2 className="max-w-2xl text-xl font-semibold sm:text-2xl">{banner.title || "Banner title"}</h2>
        {banner.subtitle ? <p className="mt-2 max-w-2xl text-sm text-blue-100">{banner.subtitle}</p> : null}
        {action ? <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-navy">{banner.cta_label}<ArrowRight className="h-4 w-4" /></span> : null}
      </article>
    );
  }
  if (placement === "homepage_ad") {
    const sponsor: HeroBanner = {
      id: "cms-sponsor-preview",
      title: banner.title || "Sponsor message",
      subtitle: banner.subtitle || undefined,
      image: banner.image_url || undefined,
      cta: action ? { label: banner.cta_label!, href: banner.deep_link! } : undefined,
    };
    return <AdStrip banner={sponsor} dismissible={false} />;
  }
  return (
    <article data-preview-placement={placement ?? "homepage"} className={cn("relative min-h-48 overflow-hidden rounded-2xl bg-[var(--nav-bg)] shadow-lg ring-1 ring-black/5", placement === "financial_services" || placement === "properties" ? "aspect-[5/2]" : "aspect-[9/5]")}>
      {banner.image_url ? <Image src={banner.image_url} alt="" fill unoptimized sizes="(min-width: 1280px) 50vw, 100vw" className="object-cover" /> : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--nav-bg)] via-[var(--nav-bg)]/70 to-transparent" />
      <div className="relative flex h-full items-center p-6 sm:p-8"><div className="max-w-sm">
        {banner.rera_verified ? <span className="mb-3 flex w-fit items-center gap-1.5 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-200 to-yellow-400 px-3 py-1 text-xs font-bold tracking-wide text-amber-950 shadow-sm"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />RERA VERIFIED</span> : null}
        <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)]">{banner.title || "Banner title"}</h2>
        {banner.subtitle ? <p className="mt-3 text-sm text-[var(--nav-text)]">{banner.subtitle}</p> : null}
        {action ? <span className="mt-5 inline-flex rounded-lg bg-[var(--nav-primary)] px-4 py-2 text-sm font-semibold text-white">{banner.cta_label}</span> : null}
      </div></div>
    </article>
  );
}

export function OfferPreview({ offer }: { offer: OfferPreviewValue }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="aspect-[16/7] bg-[var(--nav-tint)]">
        {offer.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={offer.image_url}
            alt=""
            width={960}
            height={420}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-text-secondary">Campaign artwork</div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--nav-primary)]">{offer.partner_name || "Partner"}</p>
          <span className="rounded-full bg-[var(--nav-tint)] px-3 py-1 text-xs font-semibold text-[var(--nav-primary)]">{offerDiscount(offer)}</span>
        </div>
        <h3 className="font-heading text-lg font-semibold text-foreground">{offer.title || "Offer title"}</h3>
        {offer.description ? <p className="text-sm text-text-secondary">{offer.description}</p> : null}
        {offer.code ? <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-sm"><span className="text-text-secondary">Coupon code</span><code className="font-semibold text-foreground">{offer.code}</code></div> : null}
        <p className="text-xs leading-5 text-text-secondary">Copy the code, open the partner checkout, and enter it before payment.</p>
      </div>
    </article>
  );
}
