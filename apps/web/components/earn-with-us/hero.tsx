import Image from "next/image";
import Link from "next/link";

import { EarnHeroDoodles } from "@/components/earn-with-us/earn-decor";
import { LeadDialog } from "@/components/lead-dialog";

// Earn with Us page hero. The page's only <h1> (see page.tsx). Matches the
// calculators hub hero layout: a text column beside a fixed-width illustration
// box on an in-flow grid (lg+), so the illustration drives the hero's height
// instead of floating as a background overlay. Keeps two CTAs for the two ways
// to earn (apply as an agent, refer a friend).
export function EarnHero() {
  return (
    <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
      <EarnHeroDoodles />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <h1 className="max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
              Become an agent, or refer and earn
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
              Become an agent and earn commission on the deals you bring. Or refer
              friends and earn cashback when their property purchase or loan goes
              through. Both are free.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <LeadDialog
                businessLine="loans"
                lineSelectable
                origin="agent-application-page"
                triggerLabel="Apply to become an agent"
                title="Apply to become an agent"
                description="Tell us your details and pick a line. We'll verify your KYC and get you started."
                submitLabel="Submit application"
              />
              <Link
                href="#refer-and-earn"
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[var(--nav-primary)] px-4 text-sm font-medium text-[var(--nav-primary)] transition hover:bg-[var(--nav-tint)] sm:w-auto"
              >
                Refer and earn
              </Link>
            </div>
          </div>
          {/* Desktop-only (locked rule: illustrations render lg+, never phone/tablet). */}
          <div
            aria-hidden
            className="hidden shrink-0 items-center justify-center lg:flex lg:w-[460px]"
          >
            <Image
              src="/illustrations/earn-with-us.svg"
              alt=""
              aria-hidden
              width={500}
              height={500}
              sizes="460px"
              className="h-auto w-full max-w-[460px]"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
