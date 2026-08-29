"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";

// Refer-and-earn flow scene. A single "app window" mock that plays one 12s
// loop in three beats alongside a step strip whose active item brightens in
// sync:
//   A  Get your code   -> tap Copy, "Copied" pops
//   B  Share it        -> code flies out to friends
//   C  Get cashback    -> "Collect your rewards" -> coin burst + Razorpay /
//                         cheque + confetti celebration
// All motion is CSS keyframes in globals.css (refer-* set); this file owns the
// markup and the IntersectionObserver that adds `.is-playing` so the loop runs
// only on screen. The animated frame is decorative and desktop-only (lg+); the
// step strip is the accessible content and the mobile layout. No floating
// cursor: each interaction is shown by the element pressing with a ripple.

type Step = { n: string; title: string; text: string };

// Decorative stand-in for a real referral code (which is per-account and
// never rendered here — this scene is aria-hidden and unauthenticated). Eight
// characters to match the real code's length (core/security.py::generate_referral_code)
// without asserting any specific value, live or fake.
const CODE_PLACEHOLDER = "••••••••";

// Small gold coin (natural money color, per the illustration palette).
function Coin() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#E9C46A" stroke="#C08A2E" strokeWidth="1.5" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="#8a6420">
        ₹
      </text>
    </svg>
  );
}

// Paper-plane share glyph in the brand blue.
function Plane() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path d="M22 2 L11 13 M22 2 L15 22 L11 13 L2 9 Z" fill="#315FC7" stroke="#293681" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

// Wallet glyph in the brand navy.
function Wallet() {
  return (
    <svg viewBox="0 0 56 44" className="h-12 w-14" aria-hidden>
      <rect x="3" y="8" width="50" height="32" rx="6" fill="#e0f2fe" stroke="#293681" strokeWidth="2" />
      <path d="M3 16 H40 a4 4 0 0 1 4 4 v4 a4 4 0 0 1 -4 4 H3 Z" fill="#315FC7" opacity="0.18" />
      <circle cx="41" cy="24" r="3.5" fill="#293681" />
    </svg>
  );
}

// Coin-burst targets (translate + rotate), a celebratory upward fan.
const COINS: { tx: number; ty: number; r: number }[] = [
  { tx: -92, ty: -38, r: -45 },
  { tx: -50, ty: -80, r: 20 },
  { tx: 0, ty: -96, r: -12 },
  { tx: 52, ty: -80, r: 28 },
  { tx: 92, ty: -38, r: 46 },
];

// Confetti pieces: horizontal start, drift, rotation, color. Decorative, so
// festive natural colors are allowed (illustration palette, not UI accents).
const CONFETTI: { left: string; dx: number; rot: number; color: string }[] = [
  { left: "12%", dx: -12, rot: 300, color: "#315FC7" },
  { left: "24%", dx: 16, rot: -260, color: "#E9C46A" },
  { left: "38%", dx: -8, rot: 340, color: "#EF8354" },
  { left: "50%", dx: 10, rot: -300, color: "#7BC47F" },
  { left: "62%", dx: -14, rot: 280, color: "#95CCDD" },
  { left: "76%", dx: 12, rot: -340, color: "#293681" },
  { left: "88%", dx: -10, rot: 320, color: "#E9C46A" },
];

const FRIENDS = [
  { anim: "refer-anim-friend-1", initial: "A", bg: "#315FC7" },
  { anim: "refer-anim-friend-2", initial: "S", bg: "#7BC47F" },
  { anim: "refer-anim-friend-3", initial: "R", bg: "#EF8354" },
];

export function ReferFlowScene({ steps }: { steps: Step[] }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        el.classList.toggle("is-playing", entry.isIntersecting);
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="refer-flow mt-12">
      {/* Animated app-window mock. Decorative, desktop-only. */}
      <div
        aria-hidden
        className="refer-scene pointer-events-none mx-auto hidden w-full max-w-[600px] lg:block"
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-md">
          {/* Faux title bar */}
          <div className="flex items-center gap-2 border-b border-[var(--nav-border)] bg-[var(--nav-bg)] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
            <span className="ml-3 rounded-md bg-white px-3 py-0.5 text-[11px] text-text-secondary">
              your account
            </span>
          </div>

          {/* Content stage. Scene layers stack and crossfade. */}
          <div className="relative h-[300px] overflow-hidden bg-white">
            {/* Beat A: get your code, tap Copy */}
            <div className="refer-anim-scene-a absolute inset-0 flex flex-col items-center justify-center p-6">
              <p className="text-xs uppercase tracking-wide text-text-secondary">
                Your referral code
              </p>
              <div className="refer-anim-fade-in mt-8 flex items-center gap-3">
                <span className="rounded-xl border border-dashed border-[var(--nav-primary)] bg-[var(--nav-tint)] px-6 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-[#293681]">
                  {CODE_PLACEHOLDER}
                </span>
                <span className="refer-anim-press-a relative rounded-lg bg-[var(--nav-primary)] px-4 py-3 text-sm font-medium text-white">
                  Copy
                  <span className="refer-anim-ripple-a absolute inset-0 rounded-lg bg-[var(--nav-primary)]/50" />
                  <span className="refer-anim-copied absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#293681] px-2.5 py-1 text-xs font-medium text-white">
                    Copied ✓
                  </span>
                </span>
              </div>
            </div>

            {/* Beat B: share it, code flies out to friends */}
            <div className="refer-anim-scene-b absolute inset-0 flex flex-col items-center justify-center p-6">
              <div className="relative flex items-center gap-3">
                <span className="rounded-lg border border-[var(--nav-border)] bg-[var(--nav-bg)] px-4 py-2 font-mono text-lg font-bold tracking-[0.25em] text-[#293681]">
                  {CODE_PLACEHOLDER}
                </span>
                <span className="refer-anim-press-b flex items-center gap-2 rounded-lg bg-[var(--nav-primary)] px-4 py-2.5 text-sm font-medium text-white">
                  <Plane />
                  Share
                </span>
                {/* plane that flies off toward the friends */}
                <span className="refer-anim-plane absolute -right-2 top-0">
                  <Plane />
                </span>
              </div>
              <div className="mt-8 flex items-center gap-4">
                {FRIENDS.map((f) => (
                  <span
                    key={f.initial}
                    className={`${f.anim} relative flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm`}
                    style={{ backgroundColor: f.bg }}
                  >
                    {f.initial}
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[#7BC47F] shadow">
                      ✓
                    </span>
                  </span>
                ))}
              </div>
              <p className="refer-anim-shared mt-6 text-xs font-medium text-text-secondary">
                Shared with friends
              </p>
            </div>

            {/* Beat C: collect your rewards */}
            <div className="refer-anim-scene-c absolute inset-0 flex flex-col items-center justify-center p-6">
              {/* confetti layer */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {CONFETTI.map((c, i) => (
                  <span
                    key={i}
                    className="refer-anim-confetti absolute top-[26%] block h-2.5 w-2.5 rounded-[2px]"
                    style={
                      {
                        left: c.left,
                        backgroundColor: c.color,
                        "--dx": `${c.dx}px`,
                        "--rot": `${c.rot}deg`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>

              {/* the collect button (fades out once pressed) */}
              <button
                type="button"
                tabIndex={-1}
                className="refer-anim-collect absolute z-10 rounded-full bg-[var(--nav-primary)] px-6 py-3 text-sm font-semibold text-white shadow-md"
              >
                Collect your rewards
              </button>

              {/* coin burst from the centre */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                {COINS.map((c, i) => (
                  <span
                    key={i}
                    className="refer-anim-burst absolute left-0 top-0"
                    style={
                      {
                        "--tx": `${c.tx}px`,
                        "--ty": `${c.ty}px`,
                        "--r": `${c.r}deg`,
                      } as CSSProperties
                    }
                  >
                    <Coin />
                  </span>
                ))}
              </div>

              {/* rewards revealed after the tap */}
              <div className="refer-anim-reward flex flex-col items-center">
                <div className="flex gap-3 text-xs">
                  <span className="rounded-full bg-[#315FC7] px-3 py-1 font-medium text-white">
                    Razorpay
                  </span>
                  <span className="self-center text-text-secondary">or</span>
                  <span className="rounded-full border border-[var(--nav-border)] px-3 py-1 font-medium text-text-secondary">
                    Cheque
                  </span>
                </div>
                <div className="relative mt-4 flex items-center gap-3">
                  <Wallet />
                  <span className="refer-anim-count rounded-lg bg-[var(--nav-tint)] px-3 py-1 text-base font-bold text-[#293681]">
                    + ₹500
                  </span>
                </div>
                <p className="mt-3 text-xs font-medium text-text-secondary">
                  Rewards collected
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step strip: accessible content + mobile layout. On lg the three
          badges sit on a horizontal connector line and the active step
          brightens in sync with the scene beats. */}
      <ol className="refer-steps relative mx-auto mt-10 grid max-w-xl gap-8 sm:grid-cols-1 lg:mt-14 lg:max-w-5xl lg:grid-cols-3 lg:gap-12">
        {/* connector line running across the three badge centres (lg only) */}
        <span
          aria-hidden
          className="absolute left-[16.67%] right-[16.67%] top-6 hidden h-px bg-[var(--nav-border)] lg:block"
        />
        {steps.map((step, i) => (
          <li
            key={step.n}
            className={`refer-anim-step-${i + 1} relative z-10 flex gap-4 lg:flex-col lg:items-center lg:gap-4 lg:text-center`}
          >
            <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-base font-semibold text-white shadow-sm lg:mx-auto">
              {step.n}
            </span>
            <div className="lg:max-w-[18rem]">
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
