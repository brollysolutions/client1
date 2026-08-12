import React from "react";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Banner } from "@/lib/banners-api";
import type { ContentBlock } from "@/lib/content-api";
import type { Offer } from "@/lib/offers-api";
import { isSafeLocalHref } from "@/lib/safe-local-href";

export type BannerPreviewValue = Pick<Banner, "banner_type" | "title" | "subtitle" | "cta_label" | "deep_link">;
export type OfferPreviewValue = Pick<Offer, "title" | "description" | "discount_type" | "discount_value" | "code">;
export type ContentPreviewValue = Pick<ContentBlock, "title" | "body">;

function offerDiscount(offer: OfferPreviewValue): string {
  if (offer.discount_type === "percentage") return `${offer.discount_value}% off`;
  if (offer.discount_type === "cashback-tie") return "Cashback offer";
  return `₹${offer.discount_value} off`;
}

export function BannerPreview({ banner, context }: { banner: BannerPreviewValue; context: "public" | "dashboard" }) {
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
  return (
    <article className="relative aspect-[9/5] min-h-48 overflow-hidden rounded-2xl bg-[var(--nav-bg)] shadow-lg ring-1 ring-black/5">
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--nav-bg)] via-[var(--nav-bg)]/70 to-transparent" />
      <div className="relative flex h-full items-center p-6 sm:p-8">
        <div className="max-w-sm">
          <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)]">{banner.title || "Banner title"}</h2>
          {banner.subtitle ? <p className="mt-3 text-sm text-[var(--nav-text)]">{banner.subtitle}</p> : null}
          {action ? <span className="mt-5 inline-flex rounded-lg bg-[var(--nav-primary)] px-4 py-2 text-sm font-semibold text-white">{banner.cta_label}</span> : null}
        </div>
      </div>
    </article>
  );
}

export function OfferPreview({ offer, context }: { offer: OfferPreviewValue; context: "public" | "dashboard" }) {
  if (context === "dashboard") {
    return (
      <article className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Offer</p>
        <h2 className="mt-2 font-semibold text-text-primary">{offer.title || "Offer title"}</h2>
        {offer.description ? <p className="mt-1 text-sm text-text-secondary">{offer.description}</p> : null}
        <p className="mt-3 text-sm font-semibold text-blue-800">{offerDiscount(offer)}{offer.code ? ` · Code ${offer.code}` : ""}</p>
      </article>
    );
  }
  return (
    <Card>
      <CardContent className="pt-6">
        <span className="rounded-full bg-[var(--nav-tint)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">{offerDiscount(offer)}</span>
        <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">{offer.title || "Offer title"}</h3>
        {offer.description ? <p className="mt-2 text-sm text-text-secondary">{offer.description}</p> : null}
        {offer.code ? <p className="mt-4 text-sm text-text-secondary">Use code <code className="rounded-md border border-dashed border-border px-2 py-0.5 font-semibold">{offer.code}</code></p> : null}
      </CardContent>
    </Card>
  );
}

export function ContentPreview({ block }: { block: ContentPreviewValue }) {
  return (
    <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-2xl px-4 py-12 text-center sm:px-6">
        <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">{block.title || "Content title"}</h2>
        <p className="mt-4 whitespace-pre-wrap text-base text-text-secondary">{block.body || "Add body copy to see how this section will appear."}</p>
      </div>
    </section>
  );
}
