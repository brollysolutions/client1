import {
  BellOff,
  Check,
  Gauge,
  HeartHandshake,
  Layers,
  ShieldCheck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

// Home "Why choose us": an honest comparison table (no invented stats) that
// contrasts the platform against the usual way people handle loans and property,
// going direct or juggling separate sites. Every row is a promise that is true
// today or already advertised elsewhere on the public site (see line-split.tsx
// benefits + the /loans metadata). The "them" column is deliberately generic
// ("The usual way"): no named competitors.
//
// Layout: heading + a hand-coded finance illustration on the left, the table on
// the right (lg+). Blue-only like the rest of the public site (loans-green /
// realestate-amber are reserved for authenticated dashboards). The "With us"
// column is styled as the featured panel (blue header cap + tint + side borders).
// The illustration is decorative (alt-equivalent: aria-hidden) and desktop-only,
// per the illustrations-render-lg+ rule (docs/design/illustration-style.md).
type Row = { text: string; icon: LucideIcon };

const ROWS: Row[] = [
  { text: "Loans and real estate in one place", icon: Layers },
  { text: "Partners and listings verified before you see them", icon: ShieldCheck },
  { text: "Check if you qualify before you apply", icon: Gauge },
  { text: "One person with you, from first call to done", icon: HeartHandshake },
  { text: "We never sell your number, so no spam", icon: BellOff },
  { text: "Free to use, with no hidden charges", icon: Wallet },
];

function Yes() {
  return (
    <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-primary)] text-white shadow-sm">
      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">Yes</span>
    </span>
  );
}

function No() {
  return (
    <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-foreground/5 text-text-secondary ring-1 ring-[var(--nav-border)]">
      <X className="h-4 w-4" aria-hidden />
      <span className="sr-only">No</span>
    </span>
  );
}

export function WhyChooseUs() {
  return (
    <section
      id="why-choose-us"
      aria-labelledby="why-choose-us-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-12">
          {/* Left: heading + illustration */}
          <div>
            <div className="text-center lg:text-left">
              <h2
                id="why-choose-us-heading"
                className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
              >
                Why choose us
              </h2>
              <p className="mt-4 max-w-md text-lg text-text-secondary">
                One platform, built to keep things simple, safe, and on your
                side.
              </p>
            </div>
            {/* Illustration is decorative + desktop-only (lg+). */}
            <div className="mt-8 hidden lg:block">
              <WhyIllustration className="h-auto w-full max-w-[460px] -ml-10" />
            </div>
          </div>

          {/* Right: comparison table */}
          <div className="overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-sm">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                How our platform compares with the usual way of handling loans
                and real estate
              </caption>
              <thead>
                <tr className="border-b border-[var(--nav-border)]">
                  <th
                    scope="col"
                    className="px-4 py-4 font-geist text-xs font-semibold uppercase tracking-wide text-text-secondary sm:px-5"
                  >
                    What you get
                  </th>
                  <th
                    scope="col"
                    className="w-[24%] border-x border-[var(--nav-primary)]/20 bg-[var(--nav-primary)] px-2 py-4 text-center font-heading text-sm font-semibold text-white"
                  >
                    With us
                  </th>
                  <th
                    scope="col"
                    className="w-[24%] px-2 py-4 text-center font-heading text-sm font-semibold text-text-secondary"
                  >
                    The usual way
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.text}
                    className={i === 0 ? "" : "border-t border-[var(--nav-border)]"}
                  >
                    <th scope="row" className="px-4 py-4 sm:px-5">
                      <span className="flex items-center gap-3">
                        <span className="hidden h-9 w-9 shrink-0 items-center justify-center text-brand-blue sm:flex">
                          <row.icon className="h-5 w-5" aria-hidden />
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {row.text}
                        </span>
                      </span>
                    </th>
                    <td className="border-x border-[var(--nav-primary)]/20 bg-[var(--nav-tint)]/60 px-2 py-4 text-center align-middle">
                      <Yes />
                    </td>
                    <td className="px-2 py-4 text-center align-middle">
                      <No />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

// Hand-coded finance illustration for the "Why choose us" left column. Story: on
// a balance scale, our side (a verified badge + ₹ coin) outweighs the usual way
// (a dull document), so our pan sits low and wins. Objects-only scene (no faces),
// hand-coded per the production pipeline in docs/design/illustration-style.md.
// Blue is the accent (winning pan, verified check), navy is ink (the scale),
// coins stay warm gold, ₹ not $, one warm plant. Canvas + base plate + defs
// follow the shared spec; ids are suffixed "Why" to avoid collisions.
function WhyIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="120 400 360 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="whyGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F3F3EE" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#F3F3EE" stopOpacity="0.28" />
          <stop offset="1" stopColor="#F3F3EE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="whyGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8F8F4" />
          <stop offset="1" stopColor="#E9E5D9" />
        </linearGradient>
        <filter id="whySoft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* base plate (kept within the tighter viewBox so no hard edges show) */}
      <ellipse cx="300" cy="486" rx="188" ry="150" fill="url(#whyGlow)" />
      <ellipse cx="300" cy="644" rx="150" ry="24" fill="#293681" opacity="0.15" filter="url(#whySoft)" />
      <ellipse cx="300" cy="636" rx="150" ry="26" fill="#F3F3EE" opacity="0.5" />
      <ellipse cx="300" cy="634" rx="150" ry="25" fill="url(#whyGround)" opacity="0.85" />

      {/* scale stand: pedestal base + riser + post */}
      <path d="M262 640 L338 640 L328 616 L272 616 Z" fill="#293681" />
      <rect x="285" y="606" width="30" height="13" rx="3" fill="#293681" />
      <rect x="294" y="440" width="12" height="180" rx="6" fill="#293681" />

      {/* beam pivots at the fulcrum (300,436); our side (left) tips down */}
      <circle cx="300" cy="440" r="9" fill="#293681" />
      <line x1="171" y1="461" x2="429" y2="411" stroke="#293681" strokeWidth="9" strokeLinecap="round" />
      <circle cx="300" cy="436" r="7" fill="#293681" />

      {/* our side (low, winning): blue pan holding a verified badge + gold coin */}
      <g stroke="#293681" strokeWidth="2.2" strokeLinecap="round">
        <line x1="159" y1="463" x2="146" y2="523" />
        <line x1="183" y1="463" x2="199" y2="523" />
      </g>
      <path d="M144 524 Q172 558 200 524 Z" fill="#4274D9" />
      <line x1="144" y1="524" x2="200" y2="524" stroke="#293681" strokeWidth="2.6" strokeLinecap="round" />
      {/* gold coin (behind) */}
      <circle cx="188" cy="512" r="13" fill="#E8B54D" stroke="#C08A2E" strokeWidth="2.6" />
      <text x="188" y="518" textAnchor="middle" fontSize="14" fontWeight={700} fill="#6B4E16" fontFamily="system-ui, sans-serif">&#8377;</text>
      {/* verified badge (front) */}
      <circle cx="164" cy="512" r="16" fill="#FFFFFF" stroke="#293681" strokeWidth="2.6" />
      <polyline points="157 512 163 518 173 505" fill="none" stroke="#4274D9" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* usual way (high, lighter): grey pan holding a dull document */}
      <g stroke="#293681" strokeWidth="2.2" strokeLinecap="round">
        <line x1="417" y1="413" x2="405" y2="475" />
        <line x1="441" y1="413" x2="455" y2="475" />
      </g>
      <path d="M401 476 Q429 508 457 476 Z" fill="#C7C9CE" />
      <line x1="401" y1="476" x2="457" y2="476" stroke="#293681" strokeWidth="2.6" strokeLinecap="round" />
      {/* dull document */}
      <path d="M419 444 H439 L448 453 V474 H419 Z" fill="#E4E6EA" stroke="#9AA0A8" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M439 444 V453 H448 Z" fill="#C7C9CE" stroke="#9AA0A8" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="425" y1="460" x2="441" y2="460" stroke="#9AA0A8" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="425" y1="467" x2="441" y2="467" stroke="#9AA0A8" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
