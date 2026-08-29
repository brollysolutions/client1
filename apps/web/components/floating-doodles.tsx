// Page-wide floating finance doodles for the home page. Small finance glyphs in
// their own natural colors (gold coin, blue card/percent/shield, terracotta-roof
// house, navy trend/doc) drift gently like bubbles (see .doodle-float in
// globals.css). Decorative + desktop-only (lg+), per the illustrations-render-lg+
// rule; pointer-events-none so they never block clicks; aria-hidden. Positions
// hug the left/right margins (content is centered) so the glyphs float in the
// gutters and stay off the body copy. Reduced-motion users get them static.
//
// Also the shared engine for any other page's doodle field: pass `items` (own
// kind/position data) and `renderGlyph` (own glyph renderer) to reuse the same
// wrapper, drift animation, and desktop-only/reduced-motion handling with a
// different, page-specific glyph set. See apply-as-agent/application-doodles.tsx.
import { type CSSProperties, type ReactNode } from "react";

type Kind =
  | "coin"
  | "trend"
  | "house"
  | "card"
  | "shield"
  | "doc"
  | "bag"
  | "bank"
  | "bars"
  | "pin"
  | "star";

export type Doodle = {
  kind: string;
  top: string;
  left?: string;
  right?: string;
  size: number;
  dur: string;
  delay: string;
  opacity: number;
};

// Edge-hugging scatter down the full page height. left/right stay under ~9% so
// the glyphs sit in the margins beside the centered sections, not over the copy.
const DOODLES: Doodle[] = [
  { kind: "coin", top: "9%", left: "4%", size: 46, dur: "7s", delay: "0s", opacity: 0.6 },
  { kind: "house", top: "24%", right: "5%", size: 46, dur: "10s", delay: "0.3s", opacity: 0.55 },
  { kind: "bag", top: "42%", left: "5%", size: 44, dur: "8.5s", delay: "1.3s", opacity: 0.6 },
  { kind: "star", top: "56%", right: "6%", size: 34, dur: "7.5s", delay: "0.6s", opacity: 0.6 },
  { kind: "bars", top: "72%", left: "6%", size: 40, dur: "9s", delay: "0.9s", opacity: 0.55 },
  { kind: "shield", top: "88%", right: "5%", size: 38, dur: "8s", delay: "1.6s", opacity: 0.6 },
];

function Glyph({ kind }: { kind: Kind }) {
  switch (kind) {
    case "coin":
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <circle cx="20" cy="20" r="17" fill="#E8B54D" stroke="#C08A2E" strokeWidth="2.5" />
          <circle cx="20" cy="20" r="12" fill="none" stroke="#C08A2E" strokeWidth="1.5" opacity="0.6" />
          <text x="20" y="27" textAnchor="middle" fontSize="18" fontWeight={700} fill="#6B4E16" fontFamily="system-ui, sans-serif">&#8377;</text>
        </svg>
      );
    case "trend":
      return (
        <svg viewBox="0 0 40 40" fill="none" stroke="#293681" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
          <polyline points="4 30 15 19 23 25 36 10" />
          <polyline points="27 10 36 10 36 19" />
        </svg>
      );
    case "house":
      return (
        <svg viewBox="0 0 40 40" fill="none" strokeLinejoin="round" className="h-full w-full">
          <path d="M6 20 L20 8 L34 20 Z" fill="#C4633F" />
          <rect x="10" y="20" width="20" height="14" fill="#315FC7" />
          <rect x="17" y="25" width="6" height="9" fill="#FFFFFF" />
        </svg>
      );
    case "card":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <rect x="4" y="10" width="32" height="20" rx="3" fill="#315FC7" />
          <rect x="4" y="15" width="32" height="4" fill="#293681" />
          <rect x="8" y="24" width="10" height="3" rx="1.5" fill="#FFFFFF" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <path d="M20 5 L33 10 V20 C33 29 27 34 20 36 C13 34 7 29 7 20 V10 Z" fill="#315FC7" />
          <polyline points="14 20 18 24 27 14" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "doc":
      return (
        <svg viewBox="0 0 40 40" fill="none" stroke="#293681" strokeWidth="2.5" strokeLinejoin="round" className="h-full w-full">
          <path d="M10 5 H24 L30 11 V35 H10 Z" />
          <line x1="15" y1="16" x2="25" y2="16" strokeWidth="2" strokeLinecap="round" />
          <line x1="15" y1="22" x2="25" y2="22" strokeWidth="2" strokeLinecap="round" />
          <line x1="15" y1="28" x2="21" y2="28" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "bag":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <path d="M13 15 C13 15 15 9 20 9 C25 9 27 15 27 15 C31 18 34 34 20 35 C6 34 9 18 13 15 Z" fill="#315FC7" />
          <path d="M13 15 H27" stroke="#293681" strokeWidth="3" strokeLinecap="round" />
          <text x="20" y="29" textAnchor="middle" fontSize="14" fontWeight={700} fill="#FFFFFF" fontFamily="system-ui, sans-serif">&#8377;</text>
        </svg>
      );
    case "bank":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <path d="M6 15 L20 6 L34 15 Z" fill="#293681" />
          <rect x="7" y="15" width="26" height="3" fill="#293681" />
          <rect x="10" y="19" width="4" height="13" fill="#315FC7" />
          <rect x="18" y="19" width="4" height="13" fill="#315FC7" />
          <rect x="26" y="19" width="4" height="13" fill="#315FC7" />
          <rect x="7" y="32" width="26" height="3" fill="#293681" />
        </svg>
      );
    case "bars":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <rect x="6" y="22" width="6" height="12" rx="1" fill="#95CCDD" />
          <rect x="17" y="14" width="6" height="20" rx="1" fill="#315FC7" />
          <rect x="28" y="8" width="6" height="26" rx="1" fill="#293681" />
        </svg>
      );
    case "pin":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <path d="M20 4 C12 4 6 10 6 18 C6 28 20 36 20 36 C20 36 34 28 34 18 C34 10 28 4 20 4 Z" fill="#315FC7" />
          <circle cx="20" cy="17" r="7" fill="#FFFFFF" />
          <polyline points="16 17 19 20 24 13" fill="none" stroke="#315FC7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <path d="M20 5 L24 15 L35 16 L26 23 L29 34 L20 28 L11 34 L14 23 L5 16 L16 15 Z" fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
  }
}

// subset: pick a few doodles by index (e.g. [0, 1, 3]) to thin the field on a
// smaller section. Omit for the full page-wide scatter.
// items/renderGlyph: supply a different, page-specific doodle set through the
// same wrapper/positioning/motion engine. Omit both for today's home-page
// behavior unchanged (subset still applies to the built-in DOODLES in that case).
export function FloatingDoodles({
  subset,
  items,
  renderGlyph,
}: {
  subset?: number[];
  items?: Doodle[];
  renderGlyph?: (kind: string) => ReactNode;
} = {}) {
  const data =
    items ?? (subset ? subset.map((i) => DOODLES[i]).filter(Boolean) : DOODLES);
  const glyphOf = renderGlyph ?? ((kind: string) => <Glyph kind={kind as Kind} />);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 hidden overflow-hidden lg:block"
    >
      {data.map((d, i) => (
        <span
          key={i}
          className="doodle-float absolute block"
          style={{
            top: d.top,
            left: d.left,
            right: d.right,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            animationDelay: d.delay,
            // per-element duration so the field drifts out of sync
            "--doodle-dur": d.dur,
          } as CSSProperties}
        >
          {glyphOf(d.kind)}
        </span>
      ))}
    </div>
  );
}
