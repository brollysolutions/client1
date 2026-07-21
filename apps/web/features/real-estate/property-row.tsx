"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PropertyCard } from "@/features/real-estate/property-card";
import type { REListing } from "@/lib/real-estate";

// Dashboard variant of components/property-row.tsx: same horizontal-scroll
// carousel with paging chevrons, but dashboard blue tokens and no "register to
// see more" gate card (the client is already signed in).
export function PropertyRow({
  heading,
  blurb,
  listings,
  id,
}: {
  heading: string;
  blurb?: string;
  listings: REListing[];
  id?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function page(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = direction * el.clientWidth * 0.8;
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(max, el.scrollLeft + delta));

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
      const eased = 1 - Math.pow(1 - p, 3);
      el!.scrollLeft = start + dist * eased;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (listings.length === 0) return null;

  return (
    <section id={id} aria-label={heading} className="w-full scroll-mt-16">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-semibold text-text-primary">{heading}</h3>
          {blurb ? <p className="mt-1 text-sm text-text-secondary">{blurb}</p> : null}
        </div>
      </div>

      <div className="relative mt-4">
        <button
          type="button"
          aria-label={`Scroll ${heading} left`}
          onClick={() => page(-1)}
          className="absolute -left-3 top-[42%] z-10 hidden h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-card text-brand-blue shadow-md ring-1 ring-border transition hover:bg-loans-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:flex"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Scroll ${heading} right`}
          onClick={() => page(1)}
          className="absolute -right-3 top-[42%] z-10 hidden h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-card text-brand-blue shadow-md ring-1 ring-border transition hover:bg-loans-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:flex"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>

        <div
          ref={scrollerRef}
          className="flex gap-4 overflow-x-auto scroll-px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {listings.map((listing) => (
            <div key={listing.id}>
              <PropertyCard listing={listing} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
