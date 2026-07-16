import Image from "next/image";
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
                    One partner for loans and property
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-relaxed text-text-secondary">
                    Compare, apply, and close both from one login. The same team
                    stays with you, whether it is a loan or a home.
                  </p>
                  <p className="mt-4 text-sm font-medium text-[var(--nav-primary)]">
                    Loans and property, one account.
                  </p>
                </div>
                {/* Illustration fills the right half (desktop-only, per the
                    illustrations lg+ rule). Storyset scene recolored to the public
                    blue palette; decorative, so alt="". */}
                <div className="hidden lg:flex lg:h-full lg:basis-[58%] lg:items-center lg:justify-center">
                  <Image
                    src="/illustrations/why-choose-us.svg"
                    alt=""
                    width={500}
                    height={500}
                    sizes="500px"
                    className="h-full max-h-[280px] w-auto max-w-full"
                    aria-hidden
                  />
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
