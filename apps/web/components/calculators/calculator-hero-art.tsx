import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import Image from "next/image";

import type { CalculatorGroup } from "@/lib/calculators/types";
import { cn } from "@/lib/utils";

// Decorative hero illustration for a calculator. Prefers a Storyset (Rafiki)
// SVG dropped into /public (recolored to the brand blue accent per
// docs/design/illustration-style.md), and falls back to a hand-coded monoline
// motif when the asset is not present yet, so pages always render. Always
// aria-hidden.
//
// The real asset renders at every breakpoint, taking the same scoped exception
// to the "illustrations render lg+, never phone/tablet" rule that EarnHero
// documents (see components/earn-with-us/hero.tsx): the hub and all 18
// calculator pages are otherwise text-only below lg. The coded fallback stays
// lg+ only -- see the comment on that branch.
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
  // The hero art is the desktop LCP, so small assets keep `priority` (preload).
  // But two Storyset outliers exceed 150KB — preloading those competed with
  // JS/fonts on the critical path, so anything over the threshold lazy-loads
  // (it still fetches immediately once in the viewport).
  const preload = asset ? statSync(absPath!).size < 100_000 : false;

  // With a real Storyset illustration, render it transparent so it blends into
  // the cream hero band (no card, border, or shadow). The coded fallback keeps
  // a soft tinted card so the thin monoline motif still reads.
  if (asset) {
    return (
      // Capped per breakpoint so the art complements the copy instead of eating
      // the viewport. A width ladder rather than a fixed aspect box on purpose:
      // the assets aren't uniformly square (emi.svg is 3:2), and h-auto over the
      // viewBox-derived width/height lets each keep its own ratio while still
      // reserving the right box before load. `sizes` is inert today -- next.config
      // leaves dangerouslyAllowSVG off, so next/image serves these SVGs as-is
      // with no srcset -- but it stays correct if that's ever turned on.
      <div
        aria-hidden
        className={cn(
          "flex w-full items-center justify-center md:w-[260px] lg:w-[460px]",
          className,
        )}
      >
        <Image
          src={asset}
          alt=""
          width={width}
          height={height}
          sizes="(min-width: 1024px) 460px, (min-width: 768px) 260px, (min-width: 640px) 300px, 220px"
          className="h-auto w-full max-w-[220px] sm:max-w-[300px] md:max-w-none"
          priority={preload}
        />
      </div>
    );
  }

  // Deliberately still lg+ only, unlike the asset branch above: this is a
  // placeholder card standing in for art that hasn't shipped, and an empty
  // gradient panel isn't worth the vertical space on a phone. Every one of the
  // 19 calculator surfaces ships a real asset today, so this renders nowhere.
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
