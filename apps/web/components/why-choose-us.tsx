import Link from "next/link";
import {
  ArrowRight,
  BellOff,
  Gauge,
  Gift,
  HeartHandshake,
  Layers,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

// Home "Why choose us": a bento benefit grid (no invented stats) that turns the
// platform's honest promises into scannable cards, then closes on a Get started
// CTA pointing at /register. One large anchor card carries the core "all in one
// place" message; five supporting cards cover verification, pre-qualify, single
// point of contact, privacy, and price. Copy is reused from the vetted promises
// advertised elsewhere on the public site (line-split.tsx benefits, /loans meta).
//
// Blue-only like the rest of the public site (loans-green / realestate-amber stay
// reserved for authenticated dashboards, per docs/design/ui-principles.md). The
// anchor is a soft blue tint; the closing CTA band is solid blue, so hierarchy
// reads correctly between them.
type Benefit = { title: string; detail: string; icon: LucideIcon };

// Supporting cards (the anchor card is authored inline below). Icons carry the
// meaning; each card is icon -> title -> one honest line.
const BENEFITS: Benefit[] = [
  {
    title: "Verified before you see it",
    detail:
      "Every partner and listing is checked first, so you only deal with people we trust.",
    icon: ShieldCheck,
  },
  {
    title: "Know before you apply",
    detail:
      "See whether you are likely to qualify up front, with no impact and no pressure.",
    icon: Gauge,
  },
  {
    title: "One person, start to finish",
    detail:
      "The same contact stays with you from the first call until it is done.",
    icon: HeartHandshake,
  },
  {
    title: "Your number stays private",
    detail: "We never sell it on, so you will not be buried in spam calls.",
    icon: BellOff,
  },
  {
    title: "Free to use",
    detail: "No hidden charges, and nothing to pay to get started.",
    icon: Wallet,
  },
];

// Small natural-color scene for the anchor card (desktop-only, fills the taller
// row-span-2 cell). A home (terracotta roof) reads real estate; a rupee money bag
// with a % badge reads loans; one soft link ties them: both, in one place. Natural
// real-world colors per docs/design/illustration-style.md (blue only as the link).
function AnchorScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      {/* soft ground */}
      <ellipse cx="130" cy="134" rx="104" ry="9" fill="#293681" opacity="0.08" />
      {/* the "one place" link tying home + money together */}
      <path
        d="M98 58 Q150 30 196 92"
        stroke="#4274D9"
        strokeWidth="1.6"
        strokeDasharray="2 6"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* house */}
      <path d="M44 74 L92 40 L140 74 Z" fill="#C4633F" />
      <path d="M92 40 L140 74 L118 74 Z" fill="#A24B2C" />
      <rect x="54" y="74" width="76" height="52" rx="2" fill="#FBFBF7" stroke="#E3E3DB" strokeWidth="1.4" />
      <rect x="72" y="98" width="18" height="28" rx="1.5" fill="#8A5A34" />
      <circle cx="86" cy="112" r="1.6" fill="#E8B54D" />
      <rect x="100" y="86" width="18" height="16" rx="1.5" fill="#95CCDD" stroke="#293681" strokeWidth="1.4" />
      <line x1="109" y1="86" x2="109" y2="102" stroke="#293681" strokeWidth="1" />
      <line x1="100" y1="94" x2="118" y2="94" stroke="#293681" strokeWidth="1" />
      {/* plant (the one warm natural element) */}
      <path d="M30 126 H48 L45 112 H33 Z" fill="#C4633F" />
      <rect x="28" y="109" width="22" height="5" rx="2" fill="#A24B2C" />
      <path d="M37 109 C33 100 34 92 39 88 C40 96 40 103 40 109 Z" fill="#4E8E6E" />
      <path d="M42 109 C42 98 46 91 52 88 C50 97 46 104 45 109 Z" fill="#6FA98C" />
      {/* loan money bag (jute) with a % badge, so the pair reads loans + real estate */}
      <ellipse cx="181" cy="127" rx="11" ry="4" fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.4" />
      <ellipse cx="210" cy="128" rx="9" ry="3.5" fill="#E8B54D" stroke="#C08A2E" strokeWidth="1.4" />
      <path
        d="M178 104 C172 116 176 128 196 128 C216 128 220 116 214 104 C210 99 182 99 178 104 Z"
        fill="#C9A26B"
        stroke="#A07A45"
        strokeWidth="1.6"
      />
      <path d="M184 104 L181 95 L211 95 L208 104 Z" fill="#D8B57E" stroke="#A07A45" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M181 95 Q196 89 211 95" fill="none" stroke="#8A5A34" strokeWidth="2.4" strokeLinecap="round" />
      <text x="196" y="121" textAnchor="middle" fontSize="15" fontWeight={700} fill="#6B4E16" fontFamily="system-ui, sans-serif">
        &#8377;
      </text>
      {/* % badge = the loan / interest signal */}
      <circle cx="217" cy="99" r="10" fill="#FFFFFF" stroke="#C08A2E" strokeWidth="1.6" />
      <text x="217" y="103" textAnchor="middle" fontSize="11" fontWeight={700} fill="#293681" fontFamily="system-ui, sans-serif">
        %
      </text>
    </svg>
  );
}

function IconChip({
  icon: Icon,
  large = false,
}: {
  icon: LucideIcon;
  large?: boolean;
}) {
  return (
    <span
      className={
        large
          ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--nav-primary)]/10 text-[var(--nav-primary)] ring-1 ring-[var(--nav-primary)]/20"
          : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-tint)] text-brand-blue ring-1 ring-[var(--nav-border)]"
      }
    >
      <Icon className={large ? "h-7 w-7" : "h-5 w-5"} aria-hidden />
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
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="why-choose-us-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Why choose us
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            One platform, built to keep things simple, safe, and on your side.
          </p>
        </div>

        {/* Bento benefit grid: anchor card + supporting cards */}
        <ul className="mt-12 grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Anchor card (core promise) */}
          <li className="sm:col-span-2 lg:row-span-2">
            <article className="h-full rounded-2xl border border-[var(--nav-primary)]/20 bg-[var(--nav-tint)]/60 p-6 shadow-sm sm:p-8">
              <div className="flex h-full flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
                {/* Copy. Narrower than a 50/50 split so the illustration column
                    (below) gets more width to grow into the row-span-2 height
                    instead of leaving dead space. */}
                <div className="lg:basis-[42%]">
                  <IconChip icon={Layers} large />
                  <h3 className="mt-6 font-heading text-xl font-semibold text-foreground sm:text-2xl">
                    Loans and real estate, all in one place
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-relaxed text-text-secondary">
                    One login for both. Compare, apply, and track it all without
                    juggling separate sites or agents.
                  </p>
                  <p className="mt-4 text-sm font-medium text-[var(--nav-primary)]">
                    Loans and property, one account.
                  </p>
                </div>
                {/* Illustration fills the right half (desktop-only). h-full lets the
                    scene grow with the card's row-span-2 height instead of staying
                    width-capped and leaving dead space when the card is tall. */}
                <div className="hidden lg:flex lg:h-full lg:basis-[58%] lg:items-center lg:justify-center">
                  <AnchorScene className="h-full max-h-[280px] w-auto max-w-full" />
                </div>
              </div>
            </article>
          </li>

          {/* Supporting cards */}
          {BENEFITS.map((item) => (
            <li key={item.title}>
              <article className="group flex h-full flex-col rounded-2xl border border-[var(--nav-border)] bg-surface p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <IconChip icon={item.icon} />
                <h3 className="mt-5 font-heading text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {item.detail}
                </p>
              </article>
            </li>
          ))}
        </ul>

        {/* Referral program: a slim standalone band, not a grid cell, so its
            height comes purely from its own content instead of the bento
            grid's auto-rows-fr (which would stretch it to match the tall
            anchor row). Sits between the grid and the closing CTA band. */}
        <article className="mt-5 flex flex-col gap-3 rounded-2xl border border-[var(--nav-border)] bg-surface px-6 py-6 shadow-sm sm:flex-row sm:items-center sm:gap-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-tint)] text-brand-blue ring-1 ring-[var(--nav-border)]">
            <Gift className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex-1">
            <h3 className="font-heading text-base font-semibold text-foreground">
              Refer and earn cashback
            </h3>
            <p className="text-sm leading-snug text-text-secondary">
              Share your referral code with friends. When someone you refer
              buys a property or closes a loan, you earn cashback.
            </p>
          </div>
          <Link
            href="/earn-with-us#refer-and-earn"
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--nav-primary)] hover:underline"
          >
            See how it works
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </article>

        {/* Closing CTA band -> registration */}
        <div className="mt-10 flex flex-col items-center justify-between gap-6 rounded-2xl bg-[var(--nav-primary)] p-8 text-center sm:flex-row sm:p-10 sm:text-left">
          <div>
            <p className="font-heading text-xl font-semibold text-white sm:text-2xl">
              Ready when you are
            </p>
            <p className="mt-1 text-sm text-white/80">
              Free to start, and it takes about two minutes.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 sm:items-end">
            <Button
              asChild
              size="lg"
              className="w-full bg-white text-[var(--nav-primary)] shadow-sm hover:bg-white/90 focus-visible:ring-white sm:w-auto"
            >
              <Link href="/register">
                Get started
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Link
              href="/login"
              className="text-sm text-white/80 underline underline-offset-4 hover:text-white"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
