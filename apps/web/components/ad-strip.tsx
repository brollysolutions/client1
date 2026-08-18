"use client";

// Namespace import (matching hero-carousel.tsx) so the classic JSX transform
// used by the vitest setup can render this component in tests.
import * as React from "react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { HeroBanner } from "@/lib/banners";

// Sponsored ad band between the sticky header and the full-screen homepage
// hero, fed by the `homepage_ad` banner placement.
//
// Full-bleed to match the hero below it, and laid out in the standard
// leaderboard reading order so it is recognisable as an ad at a glance:
// creative flush to the leading edge, the sponsor's copy beside it, the call to
// action at the trailing edge. A white band against the page's cream is what
// separates paid content from the site's own surfaces.
//
// The creative is a fixed width per breakpoint, so a sponsor's own image swapped
// in through the Admin template manager cannot reflow the copy next to it. The
// bundled plate is a neutral placeholder.
//
// Exactly one sponsor shows at a time, so this is NOT a carousel: no Embla, no
// autoplay, no arrows, nothing to pause for reduced motion. The "one at a time"
// rule is enforced upstream by the database --
// uq_banners_live_placement_category permits a single LIVE banner per
// (placement, category_key), and this placement seeds exactly one key.
//
// The next sponsor is queued rather than rotated: a Sub Admin authors a
// replacement naming the incumbent, Admin approves it, and the cms_activation
// job archives the incumbent and promotes the successor at its starts_at.
export function AdStrip({ banner }: { banner: HeroBanner }) {
  // Session-only, never persisted. apps/web/app/(public)/privacy/page.tsx
  // publishes "We do not use advertising or tracking cookies", so a dismissal
  // must not reach localStorage or a cookie. Matches announcement-banner.tsx.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <section
      aria-label="Sponsored"
      data-layout="ad-strip"
      className="relative w-full border-b border-[var(--nav-border)] bg-surface"
    >
      <div className="flex h-[96px] w-full items-stretch sm:h-[112px] lg:h-[124px]">
        {banner.image ? (
          <div className="relative w-24 shrink-0 bg-[var(--nav-tint)]/40 sm:w-56 lg:w-80">
            <Image
              src={banner.image}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 224px, 96px"
              className="object-cover"
              // Same reasoning as hero-carousel.tsx: /_next/image is fetched
              // server-side by the web process, which cannot resolve the
              // browser-only public asset host that Admin-uploaded artwork
              // points at.
              unoptimized
            />
          </div>
        ) : null}

        {/* Stacked below sm: at 390px a row cannot fit the copy and a
            CMS-authored CTA label side by side without truncating the sponsor. */}
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1.5 px-4 pr-10 sm:flex-row sm:items-center sm:gap-8 sm:px-6 sm:pr-14 lg:px-8">
          <div className="w-full min-w-0 sm:flex-1">
            <span className="font-geist text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
              Sponsored
            </span>
            {/* A <p>, never a heading: this is an ad above the hero, and a
                heading here would put sponsored copy at the top of the page's
                document outline. */}
            <p className="mt-0.5 truncate font-heading text-sm font-semibold text-[var(--nav-text)] sm:text-base lg:text-lg">
              {banner.title}
            </p>
            {banner.subtitle ? (
              <p className="mt-0.5 hidden truncate text-xs text-text-secondary sm:block sm:text-sm">
                {banner.subtitle}
              </p>
            ) : null}
          </div>
          {banner.cta ? (
            <Button
              asChild
              size="sm"
              className="h-7 max-w-full shrink-0 truncate bg-[var(--nav-primary)] px-3 text-xs text-white shadow-sm hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)] sm:h-9 sm:px-5 sm:text-sm"
            >
              <Link href={banner.cta.href}>{banner.cta.label}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss sponsored message"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-[var(--nav-tint)] hover:text-[var(--nav-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] sm:right-3 sm:top-3"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </section>
  );
}
