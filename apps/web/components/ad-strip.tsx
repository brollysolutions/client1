"use client";

// Namespace import (matching hero-carousel.tsx) so the classic JSX transform
// used by the vitest setup can render this component in tests.
import * as React from "react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CLOSE_BUTTON_CLASS } from "@/components/ui/close-button";
import type { HeroBanner } from "@/lib/banners";
import { cn } from "@/lib/utils";

// Sponsored ad band between the sticky header and the full-screen homepage
// hero, fed by the `homepage_ad` banner placement.
//
// The artwork occupies the leading panel and the copy sits on a soft brand-tint
// surface beside it. The explicit Sponsored eyebrow, inset stage, accent sweep
// and dismiss affordance keep paid content distinguishable from the first-party
// hero without falling back to the previous white card treatment.
//
// Exactly one sponsor shows at a time, so this is NOT a carousel: no Embla, no
// autoplay, no arrows, nothing to pause for reduced motion. The "one at a time"
// rule is enforced upstream by the database --
// uq_banners_live_placement_category permits a single LIVE banner per
// placement, regardless of its selected category/theme.
//
// The next sponsor is queued rather than rotated: a Sub Admin authors a
// replacement naming the incumbent, Admin approves it, and the cms_activation
// job archives the incumbent and promotes the successor at its starts_at.
export function AdStrip({
  banner,
  dismissible = true,
}: {
  banner: HeroBanner;
  dismissible?: boolean;
}) {
  // Session-only, never persisted. apps/web/app/(public)/privacy/page.tsx
  // publishes "We do not use advertising or tracking cookies", so a dismissal
  // must not reach localStorage or a cookie. Matches announcement-banner.tsx.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <section
      aria-label="Sponsored"
      data-layout="ad-strip"
      data-presentation="split-sponsor-card"
      className="relative isolate h-[152px] w-full overflow-hidden border-y border-brand-blue/15 bg-[#f7f2e9] px-1.5 py-1.5 sm:h-[176px] sm:px-2 sm:py-2 lg:h-[208px]"
    >
      <div className="relative flex h-full w-full overflow-hidden rounded-xl border border-brand-blue/15 bg-[linear-gradient(135deg,#eef6f8_0%,#f7f2e9_55%,#e2eef3_100%)] shadow-[0_12px_28px_-22px_rgba(10,56,88,0.8)] sm:rounded-2xl">
        <div
          aria-hidden
          className="sponsor-accent-sweep pointer-events-none absolute -top-px left-0 z-20 h-0.5 w-[28%] bg-brand-blue/80"
        />
        <div className="relative w-[40%] shrink-0 bg-[#dcecf2] sm:aspect-video sm:h-full sm:w-[284px] lg:w-[341px]">
          {banner.image ? (
            <Image
              src={banner.image}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 341px, (min-width: 640px) 284px, 40vw"
              className="object-contain p-1 sm:object-cover sm:p-0"
              // Same reasoning as hero-carousel.tsx: /_next/image is fetched
              // server-side by the web process, which cannot resolve the
              // browser-only public asset host that Admin-uploaded artwork points at.
              unoptimized
            />
          ) : null}
          <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f7f2e9]/90 to-transparent sm:w-12" />
        </div>
        <div className="flex min-w-0 flex-1 items-center px-4 py-3 pr-12 sm:px-8 sm:py-5 sm:pr-16 lg:px-12">
          <div className="min-w-0 max-w-2xl">
            <span className="inline-flex rounded-full border border-brand-blue/20 bg-brand-blue px-2.5 py-1 font-geist text-[9px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm sm:text-[10px]">
              Sponsored
            </span>
            {/* A <p>, never a heading: this is an ad above the hero, and a
                heading here would put sponsored copy at the top of the page's
                document outline. */}
            <p className="mt-2 line-clamp-2 font-heading text-base font-semibold leading-tight text-[var(--nav-text)] sm:text-xl lg:mt-3 lg:text-2xl">
              {banner.title}
            </p>
            {banner.subtitle ? (
              <p className="mt-1.5 hidden text-xs leading-relaxed text-text-secondary sm:line-clamp-2 sm:text-sm lg:mt-2 lg:text-base">
                {banner.subtitle}
              </p>
            ) : null}
            {banner.cta ? (
              <Button
                asChild
                size="sm"
                className="mt-2.5 h-8 max-w-full truncate bg-[var(--nav-primary)] px-3 text-xs text-white shadow-sm hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)] sm:mt-3 sm:h-9 sm:px-5 sm:text-sm"
              >
                <Link href={banner.cta.href}>{banner.cta.label}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {dismissible ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss sponsored message"
          className={cn("absolute right-3 top-3 z-30", CLOSE_BUTTON_CLASS)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </section>
  );
}
