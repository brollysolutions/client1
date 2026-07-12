import Image from "next/image";
import Link from "next/link";

import { LeadDialog } from "@/components/lead-dialog";

// Earn with Us page hero. The page's only <h1> (see page.tsx). Matches the
// loans/real-estate ProductPage hero: a single left-aligned copy block on the
// cream background with the illustration floated to the right edge as a
// decorative overlay (lg+ only, aria-hidden). Unlike the product heroes this
// one keeps two CTAs, the two ways to earn (apply as an agent, refer a friend).
export function EarnHero() {
  return (
    <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
      {/* Right-edge decorative illustration, desktop-only (locked rule:
          illustrations render lg+, never phone/tablet). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
      >
        <span className="absolute right-[4%] top-1/2 block aspect-square w-[40%] max-w-[440px] -translate-y-1/2">
          <Image
            src="/illustrations/earn-with-us.svg"
            alt=""
            aria-hidden
            fill
            sizes="45vw"
            className="object-contain"
            priority
          />
        </span>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <h1 className="max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
          Two ways to earn with us
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
    </section>
  );
}
