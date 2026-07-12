// Small floating doodles for the apply-as-agent application form: an ID card,
// a signature, a verification seal, and a briefcase. The form is centered, so
// the glyphs split across both side gutters like the home page's scatter.
// Reuses the FloatingDoodles engine (wrapper, .doodle-float drift,
// desktop-only, reduced-motion-safe) from components/floating-doodles.tsx
// with a page-specific glyph set instead of the home page's generic finance
// icons, per docs/design/illustration-style.md: natural color first (gold
// seal rim), blue/navy as brand emphasis, same ~40x40 viewBox convention as
// the shared set so scale reads consistently if a page ever uses both.
import { FloatingDoodles, type Doodle } from "@/components/floating-doodles";

type ApplyKind = "idcard" | "signature" | "seal" | "briefcase";

const DOODLES: (Doodle & { kind: ApplyKind })[] = [
  { kind: "idcard", top: "8%", left: "5%", size: 44, dur: "8s", delay: "0s", opacity: 0.6 },
  { kind: "signature", top: "26%", right: "6%", size: 38, dur: "9.5s", delay: "0.8s", opacity: 0.55 },
  { kind: "seal", top: "56%", left: "6%", size: 46, dur: "7.5s", delay: "1.4s", opacity: 0.6 },
  { kind: "briefcase", top: "78%", right: "5%", size: 40, dur: "10s", delay: "0.4s", opacity: 0.55 },
];

function ApplyGlyph({ kind }: { kind: string }) {
  switch (kind as ApplyKind) {
    case "idcard":
      return (
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect x="4" y="10" width="32" height="22" rx="3" fill="#FFFFFF" stroke="#293681" strokeWidth="2" />
          <circle cx="13" cy="21" r="5" fill="#F3F3EE" stroke="#293681" strokeWidth="1.5" />
          <line x1="21" y1="17" x2="32" y2="17" stroke="#4274D9" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="21" y1="22" x2="29" y2="22" stroke="#4274D9" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="21" y1="27" x2="26" y2="27" stroke="#95CCDD" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "signature":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <path d="M12 24 Q18 10 24 18 Q28 24 32 12" stroke="#293681" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="32" cy="12" r="2.6" fill="#4274D9" />
          <path d="M8 30 Q16 26 24 30 Q28 32 32 29" stroke="#95CCDD" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "seal":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <path d="M13 24 L9 34 L15 31 L18 36 L21 26 Z" fill="#C08A2E" />
          <path d="M27 24 L31 34 L25 31 L22 36 L19 26 Z" fill="#C08A2E" />
          <circle cx="20" cy="18" r="13" fill="#E8B54D" stroke="#C08A2E" strokeWidth="2" />
          <polyline points="14 18 18 22 27 12" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "briefcase":
      return (
        <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
          <rect x="6" y="16" width="28" height="18" rx="3" fill="#4274D9" stroke="#293681" strokeWidth="2" />
          <rect x="15" y="10" width="10" height="7" rx="2" fill="none" stroke="#293681" strokeWidth="2.4" />
          <rect x="17" y="23" width="6" height="5" rx="1" fill="#95CCDD" />
          <line x1="6" y1="24" x2="34" y2="24" stroke="#293681" strokeWidth="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

export function ApplicationDoodles() {
  return (
    <FloatingDoodles
      items={DOODLES}
      renderGlyph={(kind) => <ApplyGlyph kind={kind} />}
    />
  );
}
