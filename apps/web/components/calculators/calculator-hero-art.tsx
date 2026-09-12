import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ResponsiveArtwork } from "@/components/responsive-artwork";

import type { CalculatorGroup } from "@/lib/calculators/types";
import { cn } from "@/lib/utils";

// Decorative hero illustration for a calculator. Prefers a Storyset (Rafiki)
// SVG dropped into /public (recolored to the brand blue accent per
// docs/design/illustration-style.md), and falls back to a hand-coded monoline
// motif when the asset is not present yet, so pages always render. Desktop-only
// (lg+) and aria-hidden, per the illustrations rule.
//
// Server Component: it checks the public asset on disk at build time (pages are
// SSG'd), so no client JS. width/height are read from the SVG's own viewBox
// (assets aren't uniformly square, e.g. emi.svg is 3:2) so the browser reserves
// the right box before the image loads, instead of collapsing to 0 height and
// popping/jumping into place once it does.
export function CalculatorHeroArt({
  group,
  src,
  className,
}: {
  group: CalculatorGroup;
  /** Path under /public, e.g. "/illustrations/calculators/emi.svg". */
  src?: string;
  className?: string;
}) {
  // process.cwd() is apps/web during `next build`/dev and in the web container,
  // so /public resolves correctly. If a future monorepo-root build broke that,
  // the check simply fails safe to the coded fallback below (no crash).
  const absPath = src ? join(process.cwd(), "public", src) : null;
  const asset = absPath && existsSync(absPath) ? src : null;
  const { width, height } = asset ? readSvgSize(absPath!) : { width: 500, height: 500 };
  // The browser loads this desktop LCP eagerly only when the artwork's
  // breakpoint matches. Mobile copy no longer competes with a hidden preload.

  // With a real Storyset illustration, render it transparent so it blends into
  // the cream hero band (no card, border, or shadow). The coded fallback keeps
  // a soft tinted card so the thin monoline motif still reads.
  if (asset) {
    return (
      <div
        aria-hidden
        className={cn("hidden shrink-0 items-center justify-center lg:flex lg:w-[460px]", className)}
      >
        <ResponsiveArtwork
          src={asset}
          media="(min-width: 1024px)"
          width={width}
          height={height}
          sizes="460px"
          className="h-auto w-full max-w-[460px]"
          loading="eager"
          fetchPriority="high"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "hidden shrink-0 items-center justify-center rounded-2xl border border-[var(--nav-border)] bg-gradient-to-br from-white to-[var(--nav-tint)]/50 p-6 shadow-sm lg:flex lg:w-[420px]",
        className,
      )}
    >
      <svg
        viewBox="0 0 240 180"
        className="h-auto w-full max-w-[340px] text-brand-blue"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Cards/insurance fall back to the finance motif; their real SVGs ship anyway. */}
        {group === "real_estate" ? <RealEstateArt /> : <LoansArt />}
      </svg>
    </div>
  );
}

function readSvgSize(absPath: string): { width: number; height: number } {
  const viewBox = readFileSync(absPath, "utf8").match(
    /viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/,
  );
  return viewBox
    ? { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) }
    : { width: 500, height: 500 };
}

function LoansArt() {
  return (
    <>
      {/* rising bars */}
      <rect x="24" y="104" width="26" height="46" rx="3" />
      <rect x="60" y="80" width="26" height="70" rx="3" />
      <rect x="96" y="56" width="26" height="94" rx="3" />
      {/* trend arrow over the bars */}
      <polyline points="30 96 74 66 110 44 150 30" />
      <polyline points="138 30 152 28 154 42" />
      {/* coin with rupee */}
      <circle cx="182" cy="118" r="30" />
      <text
        x="182"
        y="129"
        textAnchor="middle"
        fontSize="30"
        fontWeight={700}
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, sans-serif"
      >
        &#8377;
      </text>
      {/* small coins */}
      <circle cx="150" cy="150" r="10" />
      <circle cx="210" cy="156" r="8" />
    </>
  );
}

function RealEstateArt() {
  return (
    <>
      {/* house */}
      <path d="M40 92 L96 48 L152 92" />
      <rect x="56" y="92" width="80" height="62" rx="3" />
      <rect x="86" y="116" width="20" height="38" />
      <rect x="66" y="102" width="16" height="16" />
      <rect x="112" y="102" width="16" height="16" />
      {/* key */}
      <circle cx="186" cy="70" r="16" />
      <line x1="198" y1="82" x2="222" y2="106" />
      <line x1="212" y1="96" x2="206" y2="102" />
      <line x1="218" y1="102" x2="212" y2="108" />
      {/* ground line + growth marker */}
      <line x1="28" y1="156" x2="200" y2="156" />
      <polyline points="164 150 176 138 186 144 200 128" />
    </>
  );
}
