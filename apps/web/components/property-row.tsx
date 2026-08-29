"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

import { PropertyCard } from "@/components/property-card";
import type { PropertyListing } from "@/lib/properties";

// A titled horizontal-scroll row of property cards (sale and rental listings).
// Native
// scroll on trackpad/drag/touch, plus chevron buttons that page the row on
// click. When `showMore` is set (the default), the last item is a "register to
// see more" card: the full catalog is gated behind sign-up, and every category
// row ends on that gate. Client component: the chevrons drive the scroller
// imperatively.

export function PropertyRow({
  heading,
  types,
  listings,
  showMore = true,
  id,
}: {
  heading: string;
  /** Optional supporting line, e.g. "Flats, plots, villas, and commercial spaces." */
  types?: string;
  listings: PropertyListing[];
  /** Render the trailing "register to see more" gate card. Default true. */
  showMore?: boolean;
  /** Scroll anchor id, e.g. a property category key for footer deep links. */
  id?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function page(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    // Scroll by ~80% of the visible width so a couple of cards move per click.
    const delta = direction * el.clientWidth * 0.8;
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(max, el.scrollLeft + delta));

    // Animate with rAF rather than scrollBy({behavior:"smooth"}): native smooth
    // scroll is unreliable in some engines, and this also respects the
    // reduced-motion preference by jumping instantly.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.scrollLeft = target;
      return;
    }

    const start = el.scrollLeft;
    const dist = target - start;
    const duration = 320;
    let startTs: number | null = null;
    function step(ts: number) {
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el!.scrollLeft = start + dist * eased;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return (
    <section id={id} aria-label={heading} className="w-full scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h3 className="font-heading text-2xl font-semibold text-[var(--nav-text)] sm:text-3xl">
          {heading}
        </h3>
        {types ? (
          <p className="mt-2 text-base text-text-secondary">{types}</p>
        ) : null}
      </div>

      <div className="relative mt-8">
        {/* Chevron buttons on the sides (blue, same as the hero carousel).
            Hidden below sm where native swipe is the primary affordance. */}
        <button
          type="button"
          aria-label={`Scroll ${heading} left`}
          onClick={() => page(-1)}
          className="absolute left-2 top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-brand-blue shadow-md ring-1 ring-[var(--nav-border)] transition hover:bg-[var(--nav-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:flex lg:left-4"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Scroll ${heading} right`}
          onClick={() => page(1)}
          className="absolute right-2 top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-brand-blue shadow-md ring-1 ring-[var(--nav-border)] transition hover:bg-[var(--nav-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:flex lg:right-4"
        >
          <ChevronRight className="h-6 w-6" aria-hidden />
        </button>

        {/* Edge fades: cards dissolve into the band at both corners, hinting at
            more content off-screen. Sit above the cards, below the chevrons. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-10 bg-gradient-to-r from-[var(--nav-bg)] to-transparent sm:w-16"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-10 bg-gradient-to-l from-[var(--nav-bg)] to-transparent sm:w-16"
        />

        {/* Scroller. Gutter padding aligns the first card with the page container
            and lets the last card peek; the shared CSS hides scrollbar chrome. */}
        <div
          ref={scrollerRef}
          className="flex gap-6 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:scroll-px-6 sm:px-6 lg:scroll-px-8 lg:px-8"
        >
          {listings.map((listing) => (
            <div key={listing.id}>
              <PropertyCard listing={listing} />
            </div>
          ))}

          {/* Trailing gate: the full catalog needs an account. */}
          {showMore ? (
            <Link
              href="/register"
              className="flex w-[280px] shrink-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--nav-primary)]/40 bg-[var(--nav-tint)]/40 p-6 text-center transition hover:bg-[var(--nav-tint)] sm:w-[300px]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nav-primary)] text-white">
                <ArrowRight className="h-6 w-6" aria-hidden />
              </span>
              <span className="font-heading text-lg font-semibold text-[var(--nav-text)]">
                See more properties
              </span>
              <span className="text-sm text-text-secondary">
                Register to explore the full list of verified properties.
              </span>
              <span className="mt-1 font-geist text-sm font-semibold text-brand-blue">
                Create a free account
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
