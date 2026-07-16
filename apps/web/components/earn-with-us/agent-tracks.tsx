import Link from "next/link";

import { AgentTracksDoodles } from "@/components/earn-with-us/earn-decor";

// Static two-column layout, not shadcn Tabs: Radix Tabs.Content unmounts
// inactive panels by default, which would keep the real-estate/RERA copy out
// of the initial HTML. Both columns always render server-side so both keyword
// clusters (loan DSA, real estate referral agent) stay crawlable. Stacks on
// mobile.
export function EarnAgentTracks() {
  return (
    <section
      id="agent-tracks"
      aria-labelledby="agent-tracks-heading"
      className="relative w-full overflow-hidden scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <AgentTracksDoodles />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="agent-tracks-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Pick your line
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            You&apos;ll work a single line. Choose the one you can bring deals
            in.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-[var(--nav-border)] bg-[var(--nav-tint)] p-7 shadow-sm">
            <h3 className="font-heading text-xl font-semibold text-foreground">
              Loan partner
            </h3>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-text-secondary">
              Bring us people looking for a personal, business, property,
              vehicle, or education loan. No RERA code needed, just valid KYC
              and genuine leads.
            </p>
            <Link
              href="/apply-as-agent?line=loans"
              className="mt-auto inline-flex h-10 items-center justify-center rounded-md bg-[var(--nav-primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--nav-primary-hover)]"
            >
              Apply as a loan partner
            </Link>
          </article>

          <article className="flex flex-col rounded-2xl border border-[var(--nav-border)] bg-[var(--nav-tint)] p-7 shadow-sm">
            <h3 className="font-heading text-xl font-semibold text-foreground">
              Real estate partner
            </h3>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-text-secondary">
              Bring us property buyers or new listings. A valid RERA agent
              code is required as part of your KYC for this line.
            </p>
            <Link
              href="/apply-as-agent?line=real_estate"
              className="mt-auto inline-flex h-10 items-center justify-center rounded-md bg-[var(--nav-primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--nav-primary-hover)]"
            >
              Apply as a real estate partner
            </Link>
          </article>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <p className="text-sm text-text-secondary">
            Have questions before you apply?
          </p>
          <Link
            href="/contact?line=agent"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--nav-primary)] px-4 text-sm font-medium text-[var(--nav-primary)] transition hover:bg-[var(--nav-tint)]"
          >
            Contact us
          </Link>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-text-secondary">
          Every partner account is single-line. If you already have a client
          account, you can still apply for a separate partner account through
          the same KYC process.
        </p>
      </div>
    </section>
  );
}
