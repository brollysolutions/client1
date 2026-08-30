import Image from "next/image";
import Link from "next/link";

import { EarnHeroDoodles } from "@/components/earn-with-us/earn-decor";
import { ScrollCue } from "@/components/scroll-cue";

// Earn with Us page hero. The page's only <h1> (see page.tsx). Matches the
// calculators hub hero layout: a text column beside a fixed-width illustration
// box on an in-flow grid (md+), so the illustration drives the hero's height
// instead of floating as a background overlay. Keeps two CTAs for the two ways
// to earn (apply as an agent, refer a friend).
export function EarnHero() {
  return (
    <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
      <EarnHeroDoodles />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h1 className="max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
              Become a partner, or refer and earn
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
              Become a partner and earn commission on the deals you bring. Or refer
              friends and earn cashback when their property purchase or loan goes
              through. Both are free.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/apply-as-agent"
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--nav-primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--nav-primary-hover)] sm:w-auto"
              >
                Apply to become a partner
              </Link>
              <Link
                href="/register"
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[var(--nav-primary)] px-4 text-sm font-medium text-[var(--nav-primary)] transition hover:bg-[var(--nav-tint)] sm:w-auto"
              >
                Refer and earn
              </Link>
            </div>
          </div>
          {/* Deliberate, scoped exception to the site-wide "illustrations render
              lg+, never phone/tablet" rule: this hero shows the illustration at
              every breakpoint so phone and tablet get a visual anchor. The rule
              still holds everywhere else, including the decorative doodles and
              scroll cue on this very section.

              From md up this is the standard two-column hero, just with a
              narrower art column than the 460px used at lg. Below md the grid
              collapses and this box falls under the CTAs — heading, copy,
              buttons, then art — with no DOM reorder, and the art centres in
              the column so it reads as the stack's closing beat. Spacing comes
              from the grid's gap-8 alone — no extra top margin.

              Capped per breakpoint so it complements the copy instead of eating
              the viewport, and the 1:1 width/height (matching the asset's
              500x500 viewBox) lets Next reserve the box, so nothing shifts. */}
          <div
            aria-hidden
            className="flex w-full items-center justify-center md:w-[260px] lg:w-[460px]"
          >
            <Image
              src="/illustrations/earn-with-us.svg"
              alt=""
              aria-hidden
              width={500}
              height={500}
              sizes="(min-width: 1024px) 460px, (min-width: 768px) 260px, (min-width: 640px) 300px, 220px"
              className="h-auto w-full max-w-[220px] sm:max-w-[300px] md:max-w-none"
              priority
            />
          </div>
        </div>
      </div>
      <ScrollCue />
    </section>
  );
}
