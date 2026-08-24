import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

// Illustration-led card for the Explore hub and its category grids. Mirrors
// the technique in components/financial-services-catalogue.tsx (ServiceCard /
// CardArtwork) -- 4:3 art plate, hover zoom, a designed fallback plate when a
// slug has no art yet -- but on dashboard tokens (bg-card, border-border,
// hover:border-brand-cta) rather than the public site's --nav-* variables;
// the two visual systems are deliberately kept separate.
export function ExploreArtCard({
  href,
  title,
  blurb,
  meta,
  illustration,
  fallbackIcon: FallbackIcon,
  className,
}: {
  href: string;
  title: string;
  blurb?: string;
  meta?: string;
  illustration?: string;
  fallbackIcon: LucideIcon;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-1 hover:border-brand-cta hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-loans-soft/60">
        {illustration ? (
          // Product art is authored at exactly 320x240 (4:3), so object-contain
          // fills the plate edge to edge without cropping or padding.
          <Image
            src={illustration}
            alt=""
            aria-hidden
            fill
            sizes="(min-width:1280px) 300px, (min-width:1024px) 31vw, (min-width:640px) 47vw, 92vw"
            className="object-contain transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div aria-hidden className="relative h-full w-full">
            {/* Mirrors the illustration family's backdrop disc and ground shadow
                so an unmapped slug still reads as a designed state. */}
            <span className="absolute bottom-[15%] left-1/2 h-2.5 w-[52%] -translate-x-1/2 rounded-[50%] bg-brand-navy/[0.08]" />
            <span className="absolute left-1/2 top-[46%] flex aspect-square h-[52%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-loans-soft">
              <FallbackIcon className="h-1/2 w-1/2 text-loans-accent" strokeWidth={1.5} />
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-5 pt-4">
        <span className="font-semibold text-text-primary transition-colors group-hover:text-brand-cta">
          {title}
        </span>
        {blurb ? <span className="text-sm text-text-secondary">{blurb}</span> : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
        {meta ? (
          <span className="text-xs font-medium text-text-secondary">{meta}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-cta">
          <span>Explore</span>
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
